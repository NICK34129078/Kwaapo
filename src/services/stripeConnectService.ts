import * as WebBrowser from "expo-web-browser";

import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { logSellerOnboarding } from "../constants/sellerOnboardingDebug";
import { buildWorkerAuthHeaders } from "./workerRequest";
import { mapStripeConnectUserMessage } from "../utils/stripeConnectErrors";
import type { StripeConnectState } from "../utils/stripeConnectState";
import { canProceedToStripeStep3 } from "../utils/stripeConnectState";

const STRIPE_CONNECT_RETURN_PREFIX = `${CLOUD_VIDEO_WORKER_BASE}?stripeConnectReturn=1`;

export type StripeConnectStatus = {
  success: boolean;
  state: StripeConnectState;
  accountId: string | null;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingComplete: boolean;
  canProceedToStep3: boolean;
  currentlyDueCount: number;
  pastDueCount: number;
  disabledReason: string | null;
  requirementsCurrentlyDue: string[];
  requirementsEventuallyDue: string[];
  requirementsPastDue: string[];
  userFriendlyStatus: string;
  statusLabel: string;
  payoutReady: boolean;
  sellerOnboardingStatus: string | null;
  alreadyComplete?: boolean;
};

type WorkerJson = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  message?: string;
  detail?: string;
  step?: string;
  state?: string;
};

function formatWorkerError(json: WorkerJson, status: number, context: "status" | "link"): string {
  return mapStripeConnectUserMessage(json, status, context);
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

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((x): x is string => typeof x === "string");
}

function resolveState(json: WorkerJson): StripeConnectState {
  const raw = typeof json.state === "string" ? json.state : "error";
  const allowed: StripeConnectState[] = [
    "not_started",
    "onboarding_incomplete",
    "details_submitted",
    "pending_verification",
    "ready",
    "restricted",
    "error",
  ];
  return allowed.includes(raw as StripeConnectState) ? (raw as StripeConnectState) : "error";
}

function normalizeStatus(json: WorkerJson): StripeConnectStatus {
  const accountId =
    typeof json.accountId === "string" && json.accountId.startsWith("acct_")
      ? json.accountId
      : null;

  const requirementsCurrentlyDue = stringArray(json.requirementsCurrentlyDue);
  const requirementsPastDue = stringArray(json.requirementsPastDue);
  const detailsSubmitted = json.detailsSubmitted === true;
  const currentlyDueCount =
    typeof json.currentlyDueCount === "number"
      ? json.currentlyDueCount
      : requirementsCurrentlyDue.length;

  const userFriendly =
    typeof json.userFriendlyStatus === "string" && json.userFriendlyStatus.length > 0
      ? json.userFriendlyStatus
      : typeof json.statusLabel === "string" && json.statusLabel.length > 0
        ? json.statusLabel
        : "Uitbetalingen instellen";

  const canProceedToStep3 =
    json.canProceedToStep3 === true ||
    canProceedToStripeStep3({
      detailsSubmitted,
      requirementsCurrentlyDue,
    });

  return {
    success: json.success === true,
    state: resolveState(json),
    accountId,
    detailsSubmitted,
    chargesEnabled: json.chargesEnabled === true,
    payoutsEnabled: json.payoutsEnabled === true,
    onboardingComplete:
      json.onboardingComplete === true || detailsSubmitted,
    canProceedToStep3,
    currentlyDueCount,
    pastDueCount:
      typeof json.pastDueCount === "number"
        ? json.pastDueCount
        : requirementsPastDue.length,
    disabledReason:
      typeof json.disabledReason === "string" ? json.disabledReason : null,
    requirementsCurrentlyDue,
    requirementsEventuallyDue: stringArray(json.requirementsEventuallyDue),
    requirementsPastDue,
    userFriendlyStatus: userFriendly,
    statusLabel:
      typeof json.statusLabel === "string" && json.statusLabel.length > 0
        ? json.statusLabel
        : userFriendly,
    payoutReady: json.payoutReady === true,
    sellerOnboardingStatus:
      typeof json.sellerOnboardingStatus === "string"
        ? json.sellerOnboardingStatus
        : null,
    alreadyComplete: json.alreadyComplete === true,
  };
}

function logStripeStatusResponse(url: string, httpStatus: number, json: WorkerJson, status: StripeConnectStatus): void {
  logSellerOnboarding("STRIPE_STATUS_REQUEST_URL", {
    route: "stripeConnectStatus",
    host: new URL(url).host,
  });
  logSellerOnboarding("STRIPE_STATUS_HTTP_STATUS", { httpStatus });
  logSellerOnboarding("STRIPE_STATUS_RESPONSE_KEYS", {
    keys: Object.keys(json).slice(0, 20),
  });
  logSellerOnboarding("STRIPE_STATUS_RESPONSE_STATE", { state: status.state });
  logSellerOnboarding("STRIPE_STATUS_DETAILS_SUBMITTED", {
    detailsSubmitted: status.detailsSubmitted,
  });
  logSellerOnboarding("STRIPE_STATUS_CHARGES_ENABLED", {
    chargesEnabled: status.chargesEnabled,
  });
  logSellerOnboarding("STRIPE_STATUS_PAYOUTS_ENABLED", {
    payoutsEnabled: status.payoutsEnabled,
  });
  logSellerOnboarding("STRIPE_STATUS_CURRENTLY_DUE_COUNT", {
    currentlyDueCount: status.currentlyDueCount,
  });
  logSellerOnboarding("STRIPE_STATUS_DISABLED_REASON", {
    hasDisabledReason: !!status.disabledReason,
  });
  logSellerOnboarding("STRIPE_STATUS_CAN_PROCEED_STEP3", {
    canProceedToStep3: status.canProceedToStep3,
  });
}

/**
 * Haalt actuele Stripe-status op en synchroniseert Supabase via de Worker.
 * Opent nooit Stripe.
 */
export async function refreshStripeConnectStatus(): Promise<StripeConnectStatus> {
  const url = new URL(CLOUD_VIDEO_WORKER_BASE);
  url.searchParams.set("stripeConnectStatus", "1");

  logSellerOnboarding("STRIPE_STATUS_REQUEST_START");

  const headers = await buildWorkerAuthHeaders();

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Netwerkfout";
    logSellerOnboarding("STRIPE_STATUS_SYNC_ERROR_MESSAGE", { message });
    throw new Error(formatWorkerError({ error: message, step: "stripe_connect_status" }, 0, "status"));
  }

  const json = await parseWorkerResponse(res);

  if (!res.ok || json.success !== true || typeof json.error === "string") {
    logSellerOnboarding("STRIPE_STATUS_SYNC_ERROR_CODE", {
      httpStatus: res.status,
      step: json.step ?? null,
    });
    logSellerOnboarding("STRIPE_STATUS_SYNC_ERROR_MESSAGE", {
      message: typeof json.error === "string" ? json.error.slice(0, 180) : "unknown",
    });
    throw new Error(formatWorkerError(json, res.status, "status"));
  }

  const status = normalizeStatus(json);
  logStripeStatusResponse(url.toString(), res.status, json, status);
  return status;
}

export type OpenStripeConnectResult =
  | { ok: true; alreadyComplete: true; status: StripeConnectStatus }
  | { ok: true; alreadyComplete: false; status: StripeConnectStatus }
  | { ok: false; message: string };

/**
 * Opent Stripe Connect alleen wanneer nog invoer nodig is.
 * Synchroniseert status na terugkeer; opent niet opnieuw als formulier al af is.
 */
export async function openStripeConnectOnboarding(): Promise<OpenStripeConnectResult> {
  logSellerOnboarding("STRIPE_ONBOARDING_LINK_START");

  const linkUrl = new URL(CLOUD_VIDEO_WORKER_BASE);
  linkUrl.searchParams.set("stripeConnectOnboardingLink", "1");

  const linkHeaders = await buildWorkerAuthHeaders({
    "Content-Type": "application/json",
  });

  let linkRes: Response;
  try {
    linkRes = await fetch(linkUrl.toString(), {
      method: "POST",
      headers: linkHeaders,
      body: "{}",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Netwerkfout";
    logSellerOnboarding("STRIPE_ONBOARDING_LINK_FAILED", { message });
    return { ok: false, message: formatWorkerError({ error: message, step: "stripe_connect_link" }, 0, "link") };
  }

  const linkJson = await parseWorkerResponse(linkRes);

  if (!linkRes.ok || typeof linkJson.error === "string") {
    logSellerOnboarding("STRIPE_ONBOARDING_LINK_FAILED", {
      httpStatus: linkRes.status,
      step: linkJson.step ?? null,
      message:
        typeof linkJson.error === "string" ? linkJson.error.slice(0, 180) : "unknown",
    });
    return {
      ok: false,
      message: formatWorkerError(linkJson, linkRes.status, "link"),
    };
  }

  if (linkJson.success === true && linkJson.canProceedToStep3 === true && linkJson.alreadyComplete === true) {
    const status = normalizeStatus(linkJson);
    return { ok: true, alreadyComplete: true, status };
  }

  const onboardingUrl =
    typeof linkJson.onboardingUrl === "string" ? linkJson.onboardingUrl : null;

  if (!onboardingUrl) {
    logSellerOnboarding("STRIPE_ONBOARDING_LINK_FAILED", { reason: "missing_onboarding_url" });
    return { ok: false, message: "Geen Stripe onboarding URL ontvangen." };
  }

  await WebBrowser.openAuthSessionAsync(onboardingUrl, STRIPE_CONNECT_RETURN_PREFIX);

  try {
    const status = await refreshStripeConnectStatus();
    return { ok: true, alreadyComplete: false, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Status ophalen mislukt.";
    logSellerOnboarding("STRIPE_STATUS_SYNC_ERROR_MESSAGE", { message: msg });
    return { ok: false, message: msg };
  }
}

/** @deprecated Gebruik refreshStripeConnectStatus of openStripeConnectOnboarding. */
export async function startStripeConnectOnboarding(): Promise<
  | { ok: true; status: StripeConnectStatus }
  | { ok: false; message: string }
> {
  const result = await openStripeConnectOnboarding();
  if (!result.ok) {
    return result;
  }
  return { ok: true, status: result.status };
}

export type StartPayoutManageResult =
  | { ok: true }
  | { ok: false; message: string };

export async function startStripePayoutManagement(): Promise<StartPayoutManageResult> {
  const linkUrl = new URL(CLOUD_VIDEO_WORKER_BASE);
  linkUrl.searchParams.set("stripeConnectPayoutManageLink", "1");

  const linkHeaders = await buildWorkerAuthHeaders({
    "Content-Type": "application/json",
  });

  const linkRes = await fetch(linkUrl.toString(), {
    method: "POST",
    headers: linkHeaders,
    body: "{}",
  });

  const linkJson = await parseWorkerResponse(linkRes);

  if (!linkRes.ok || typeof linkJson.error === "string") {
    return {
      ok: false,
      message: formatWorkerError(linkJson, linkRes.status, "link"),
    };
  }

  const manageUrl =
    typeof linkJson.manageUrl === "string" ? linkJson.manageUrl : null;

  if (!manageUrl) {
    return { ok: false, message: "Geen Stripe beheer-URL ontvangen." };
  }

  await WebBrowser.openAuthSessionAsync(manageUrl, STRIPE_CONNECT_RETURN_PREFIX);

  try {
    await refreshStripeConnectStatus();
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Status ophalen mislukt.";
    return { ok: false, message: msg };
  }
}
