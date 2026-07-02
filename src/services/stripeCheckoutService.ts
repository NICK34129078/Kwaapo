import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { supabase } from "../lib/supabase";
import { buildWorkerAuthHeaders } from "./workerRequest";
import type { Order } from "../types/order";
import { mapOrderRow, type OrderRow } from "../types/order";

/** HTTPS return pages — reliable in Expo Go / Safari (custom scheme often fails). */
const WORKER_CHECKOUT_SUCCESS_URL = `${CLOUD_VIDEO_WORKER_BASE}?checkoutReturn=1&session_id={CHECKOUT_SESSION_ID}`;
const WORKER_CHECKOUT_CANCEL_URL = `${CLOUD_VIDEO_WORKER_BASE}?checkoutCancel=1`;

/** App deep links (production / dev client). */
const APP_CHECKOUT_SUCCESS_PREFIX = Linking.createURL("checkout/success");
const APP_CHECKOUT_CANCEL_PREFIX = Linking.createURL("checkout/cancel");

/** Prefix for WebBrowser.openAuthSessionAsync — matches Worker HTTPS returns. */
const BROWSER_AUTH_RETURN_PREFIX = CLOUD_VIDEO_WORKER_BASE;

export type StripeCheckoutSessionResponse = {
  checkoutUrl: string;
  sessionId: string;
  orderId: string;
};

export type StripeCheckoutConfirmResponse = {
  orderId: string;
  paymentStatus: string;
  status: string;
  paid: boolean;
  stripePaidPending?: boolean;
};

export type CheckoutReturnUrls = {
  stripeSuccessUrl: string;
  stripeCancelUrl: string;
  appSuccessPrefix: string;
  appCancelPrefix: string;
  browserReturnPrefix: string;
};

export function buildCheckoutReturnUrls(): CheckoutReturnUrls {
  return {
    stripeSuccessUrl: WORKER_CHECKOUT_SUCCESS_URL,
    stripeCancelUrl: WORKER_CHECKOUT_CANCEL_URL,
    appSuccessPrefix: APP_CHECKOUT_SUCCESS_PREFIX,
    appCancelPrefix: APP_CHECKOUT_CANCEL_PREFIX,
    browserReturnPrefix: BROWSER_AUTH_RETURN_PREFIX,
  };
}

type WorkerJson = Record<string, unknown> & {
  error?: string;
  message?: string;
  detail?: string;
  step?: string;
};

function formatWorkerError(json: WorkerJson, status: number): string {
  if (status === 401 || status === 403) {
    return "Je sessie is verlopen. Log opnieuw in en probeer het opnieuw.";
  }
  if (json.step === "seller_connect_not_ready") {
    return typeof json.message === "string" && json.message.length > 0
      ? json.message
      : "Deze verkoper kan momenteel nog geen betalingen ontvangen.";
  }
  return "Er ging iets mis. Probeer het opnieuw.";
}

async function parseWorkerResponse(res: Response): Promise<WorkerJson> {
  const text = await res.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as WorkerJson;
  } catch {
    throw new Error(
      `Worker antwoord is geen JSON (${res.status}): ${text.slice(0, 280)}`
    );
  }
}

async function workerPost<T>(
  query: string,
  body: Record<string, unknown>
): Promise<T> {
  const headers = await buildWorkerAuthHeaders({
    "Content-Type": "application/json",
  });
  const url = `${CLOUD_VIDEO_WORKER_BASE}?${query}`;
  console.log("[Stripe] POST", url);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await parseWorkerResponse(res);
  console.log("[Stripe] Worker response", res.status, json);

  if (!res.ok || typeof json.error === "string") {
    throw new Error(formatWorkerError(json, res.status));
  }
  return json as T;
}

function normalizeCheckoutPayload(json: WorkerJson): StripeCheckoutSessionResponse {
  const checkoutUrl =
    (typeof json.checkoutUrl === "string" && json.checkoutUrl) ||
    (typeof json.checkout_url === "string" && json.checkout_url) ||
    (typeof json.url === "string" && json.url) ||
    null;
  const sessionId =
    (typeof json.sessionId === "string" && json.sessionId) ||
    (typeof json.session_id === "string" && json.session_id) ||
    (typeof json.id === "string" && json.id.startsWith("cs_") ? json.id : null) ||
    null;
  const orderId =
    (typeof json.orderId === "string" && json.orderId) ||
    (typeof json.order_id === "string" && json.order_id) ||
    "";

  if (!checkoutUrl || !sessionId) {
    throw new Error(
      `Geen checkout URL in Worker-antwoord: ${JSON.stringify(json).slice(0, 320)}`
    );
  }

  return { checkoutUrl, sessionId, orderId };
}

export async function createStripeCheckoutSession(
  orderId: string
): Promise<StripeCheckoutSessionResponse> {
  const returnUrls = buildCheckoutReturnUrls();
  console.log("[Stripe] checkout return URLs", returnUrls);

  const json = await workerPost<WorkerJson>("stripeCheckout=1", {
    orderId,
    successUrl: returnUrls.stripeSuccessUrl,
    cancelUrl: returnUrls.stripeCancelUrl,
  });
  return normalizeCheckoutPayload(json);
}

/** Geef checkout-voorraadreservering vrij (annuleren / wegklikken). Idempotent. */
export async function releaseCheckoutStockReservation(orderId: string): Promise<void> {
  if (!orderId) {
    return;
  }
  try {
    await workerPost<{ released?: boolean; reason?: string }>(
      "checkoutReleaseStock=1",
      { orderId }
    );
    console.log("[Stripe] checkout stock released", orderId);
  } catch (e) {
    console.warn("[Stripe] release checkout stock failed", orderId, e);
  }
}

export async function confirmStripeCheckoutSession(
  sessionId: string
): Promise<StripeCheckoutConfirmResponse> {
  const url = new URL(CLOUD_VIDEO_WORKER_BASE);
  url.searchParams.set("stripeConfirm", "1");
  url.searchParams.set("session_id", sessionId);

  console.log("[Stripe] stripeConfirm", { sessionId });

  const headers = await buildWorkerAuthHeaders();
  const res = await fetch(url.toString(), {
    method: "GET",
    headers,
  });
  const json = await parseWorkerResponse(res);
  if (!res.ok || typeof json.error === "string") {
    throw new Error(formatWorkerError(json, res.status));
  }
  console.log("[Stripe] stripeConfirm response", json);
  return json as StripeCheckoutConfirmResponse;
}

async function fetchOrderById(orderId: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, buyer_id, seller_id, status, subtotal_amount, platform_fee_amount, seller_amount, payment_status, buyer_email, buyer_full_name, shipping_country, shipping_city, shipping_postal_code, shipping_street, shipping_house_number, shipping_phone, seller_note, shipping_status, tracking_code, shipped_at, stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_at"
    )
    .eq("id", orderId)
    .maybeSingle<OrderRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapOrderRow(data);
}

/** Wacht op webhook na terugkeer uit Stripe Checkout (geen client-side mark paid). */
export async function waitForOrderPaid(
  orderId: string,
  attempts = 25,
  delayMs = 2000
): Promise<Order | null> {
  for (let i = 0; i < attempts; i++) {
    const order = await fetchOrderById(orderId);
    console.log("[Stripe] poll order", {
      orderId,
      attempt: i + 1,
      payment_status: order?.paymentStatus ?? null,
    });
    if (order?.paymentStatus === "paid") {
      return order;
    }
    if (order?.paymentStatus === "failed") {
      return order;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return fetchOrderById(orderId);
}

function parseSessionIdFromUrl(returnUrl: string): string | null {
  try {
    const parsed = Linking.parse(returnUrl);
    const raw = parsed.queryParams?.session_id;
    if (typeof raw === "string" && raw.length > 0) {
      return raw;
    }
    if (Array.isArray(raw) && typeof raw[0] === "string") {
      return raw[0];
    }
  } catch {
    // fall through to regex
  }
  const match = returnUrl.match(/[?&]session_id=(cs_[^&]+)/i);
  return match?.[1] ?? null;
}

function isAppCancelReturnUrl(returnUrl: string): boolean {
  return (
    returnUrl.startsWith(APP_CHECKOUT_CANCEL_PREFIX) ||
    returnUrl.includes("checkoutCancel=1")
  );
}

export type OpenStripeCheckoutResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "failed"; message: string }
  | { ok: false; reason: "pending"; message: string };

/**
 * Bepaalt uitkomst via orderstatus in DB (webhook is enige bron voor paid).
 */
async function resolveOrderAfterCheckout(
  orderId: string,
  sessionId: string | null,
  options?: { fromCancelUrl?: boolean }
): Promise<OpenStripeCheckoutResult> {
  console.log("[Stripe] resolveOrderAfterCheckout", {
    orderId,
    sessionId,
    fromCancelUrl: options?.fromCancelUrl ?? false,
  });

  if (sessionId) {
    try {
      const confirm = await confirmStripeCheckoutSession(sessionId);
      console.log("[Stripe] confirm read-only", {
        orderId,
        sessionId,
        paid: confirm.paid,
        paymentStatus: confirm.paymentStatus,
        stripePaidPending: confirm.stripePaidPending,
      });
      if (confirm.paid) {
        const order = await fetchOrderById(confirm.orderId || orderId);
        if (order?.paymentStatus === "paid") {
          return { ok: true, order };
        }
      }
      if (confirm.stripePaidPending) {
        const polled = await waitForOrderPaid(orderId, 30, 2000);
        if (polled?.paymentStatus === "paid") {
          return { ok: true, order: polled };
        }
        return {
          ok: false,
          reason: "pending",
          message:
            "Stripe heeft je betaling ontvangen. We wachten op bevestiging — controleer je bestelling over een moment.",
        };
      }
    } catch (e) {
      console.warn("[Stripe] confirm failed, falling back to poll:", e);
    }
  }

  const pollAttempts = options?.fromCancelUrl ? 8 : 25;
  const polled = await waitForOrderPaid(orderId, pollAttempts, 2000);
  console.log("[Stripe] final order status", {
    orderId,
    payment_status: polled?.paymentStatus ?? null,
  });

  if (polled?.paymentStatus === "paid") {
    return { ok: true, order: polled };
  }

  if (polled?.paymentStatus === "failed") {
    return {
      ok: false,
      reason: "failed",
      message: "De betaling is mislukt. Probeer het opnieuw.",
    };
  }

  if (options?.fromCancelUrl) {
    return { ok: false, reason: "cancelled" };
  }

  return {
    ok: false,
    reason: "pending",
    message:
      "De betaling is nog niet bevestigd. Open je bestelling om opnieuw te proberen of de status te volgen.",
  };
}

/**
 * Opent Stripe Checkout en bepaalt uitkomst via orderstatus (niet alleen deep link).
 */
export async function openStripeCheckoutAndConfirm(
  checkoutUrl: string,
  orderId: string,
  sessionId: string
): Promise<OpenStripeCheckoutResult> {
  const returnUrls = buildCheckoutReturnUrls();
  console.log("[Stripe] openAuthSession", {
    orderId,
    sessionId,
    browserReturnPrefix: returnUrls.browserReturnPrefix,
    appSuccessPrefix: returnUrls.appSuccessPrefix,
  });

  const result = await WebBrowser.openAuthSessionAsync(
    checkoutUrl,
    returnUrls.browserReturnPrefix
  );

  console.log("[Stripe] WebBrowser result", {
    type: result.type,
    url: "url" in result && result.url ? result.url.slice(0, 200) : null,
    orderId,
    sessionId,
  });

  const sessionFromUrl =
    result.type === "success" && "url" in result && result.url
      ? parseSessionIdFromUrl(result.url)
      : null;
  const sessionIdToUse = sessionFromUrl ?? sessionId;
  const fromCancelUrl =
    result.type === "success" &&
    "url" in result &&
    !!result.url &&
    isAppCancelReturnUrl(result.url);

  if (sessionFromUrl) {
    console.log("[Stripe] session_id from return URL", sessionFromUrl);
  }

  if (fromCancelUrl) {
    console.log("[Stripe] explicit cancel return URL, checking order status");
    return resolveOrderAfterCheckout(orderId, sessionIdToUse, { fromCancelUrl: true });
  }

  // Altijd orderstatus controleren — ook bij dismiss/cancel (Expo Go / Safari scheme-fouten).
  return resolveOrderAfterCheckout(orderId, sessionIdToUse);
}
