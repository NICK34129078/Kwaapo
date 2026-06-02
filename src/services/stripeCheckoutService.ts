import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { supabase } from "../lib/supabase";
import type { Order } from "../types/order";
import { mapOrderRow, type OrderRow } from "../types/order";

const CHECKOUT_RETURN_PREFIX = Linking.createURL("checkout/success");
const CHECKOUT_CANCEL_PREFIX = Linking.createURL("checkout/cancel");

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
};

async function getAuthUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }
  return user.id;
}

type WorkerJson = Record<string, unknown> & {
  error?: string;
  message?: string;
  detail?: string;
  step?: string;
};

function formatWorkerError(json: WorkerJson, status: number): string {
  const parts = [json.error, json.message, json.detail, json.step]
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  if (parts.length > 0) {
    return parts.join(" — ");
  }
  const raw = JSON.stringify(json);
  return raw.length > 2
    ? `Worker ${status}: ${raw.slice(0, 320)}`
    : `Worker ${status}: leeg antwoord`;
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
  const userId = await getAuthUserId();
  const url = `${CLOUD_VIDEO_WORKER_BASE}?${query}`;
  console.log("[Stripe] POST", url, { orderId: body.orderId });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-User-Id": userId,
    },
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
  const json = await workerPost<WorkerJson>("stripeCheckout=1", { orderId });
  return normalizeCheckoutPayload(json);
}

export async function confirmStripeCheckoutSession(
  sessionId: string
): Promise<StripeCheckoutConfirmResponse> {
  const userId = await getAuthUserId();
  const url = new URL(CLOUD_VIDEO_WORKER_BASE);
  url.searchParams.set("stripeConfirm", "1");
  url.searchParams.set("session_id", sessionId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "X-App-User-Id": userId },
  });
  const json = await parseWorkerResponse(res);
  if (!res.ok || typeof json.error === "string") {
    throw new Error(formatWorkerError(json, res.status));
  }
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

/** Wacht kort op webhook/sync na terugkeer uit Stripe Checkout. */
export async function waitForOrderPaid(
  orderId: string,
  attempts = 8,
  delayMs = 1200
): Promise<Order | null> {
  for (let i = 0; i < attempts; i++) {
    const order = await fetchOrderById(orderId);
    if (order?.paymentStatus === "paid") {
      return order;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return fetchOrderById(orderId);
}

function parseSessionIdFromUrl(returnUrl: string): string | null {
  const parsed = Linking.parse(returnUrl);
  const raw = parsed.queryParams?.session_id;
  if (typeof raw === "string" && raw.length > 0) {
    return raw;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    return raw[0];
  }
  return null;
}

export type OpenStripeCheckoutResult =
  | { ok: true; order: Order }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "failed"; message: string };

/**
 * Opent Stripe Checkout in de browser en bevestigt betaling na terugkeer.
 */
export async function openStripeCheckoutAndConfirm(
  checkoutUrl: string,
  orderId: string,
  sessionId: string
): Promise<OpenStripeCheckoutResult> {
  const result = await WebBrowser.openAuthSessionAsync(
    checkoutUrl,
    CHECKOUT_RETURN_PREFIX
  );

  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, reason: "cancelled" };
  }

  if (result.type !== "success" || !result.url) {
    return { ok: false, reason: "failed", message: "Betaling niet afgerond." };
  }

  if (result.url.startsWith(CHECKOUT_CANCEL_PREFIX)) {
    return { ok: false, reason: "cancelled" };
  }

  const sessionFromUrl = parseSessionIdFromUrl(result.url) ?? sessionId;

  try {
    const confirm = await confirmStripeCheckoutSession(sessionFromUrl);
    if (confirm.paid) {
      const order = await fetchOrderById(confirm.orderId || orderId);
      if (order) {
        return { ok: true, order };
      }
    }
  } catch (e) {
    console.warn("[Stripe] confirm failed, polling order:", e);
  }

  const polled = await waitForOrderPaid(orderId);
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

  return {
    ok: false,
    reason: "failed",
    message:
      "Betaling nog niet bevestigd. Controleer je e-mail of probeer het later opnieuw.",
  };
}
