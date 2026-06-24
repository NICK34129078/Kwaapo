import * as WebBrowser from "expo-web-browser";

import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";

import { supabase } from "../lib/supabase";



const STRIPE_CONNECT_RETURN_PREFIX = `${CLOUD_VIDEO_WORKER_BASE}?stripeConnectReturn=1`;



export type StripeConnectStatus = {

  accountId: string | null;

  detailsSubmitted: boolean;

  chargesEnabled: boolean;

  payoutsEnabled: boolean;

  onboardingComplete: boolean;

  requirementsCurrentlyDue: string[];

  requirementsEventuallyDue: string[];

  requirementsPastDue: string[];

  disabledReason: string | null;

  userFriendlyStatus: string;

  statusLabel: string;

  payoutReady: boolean;

  sellerOnboardingStatus: string | null;

};



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

  return `Worker ${status}: onbekende fout`;

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



function stringArray(value: unknown): string[] {

  if (!Array.isArray(value)) {

    return [];

  }

  return value.filter((x): x is string => typeof x === "string");

}



function normalizeStatus(json: WorkerJson): StripeConnectStatus {

  const accountId =

    typeof json.accountId === "string" && json.accountId.startsWith("acct_")

      ? json.accountId

      : null;

  const userFriendly =

    typeof json.userFriendlyStatus === "string" && json.userFriendlyStatus.length > 0

      ? json.userFriendlyStatus

      : typeof json.statusLabel === "string" && json.statusLabel.length > 0

        ? json.statusLabel

        : "Uitbetalingen instellen";



  return {

    accountId,

    detailsSubmitted: json.detailsSubmitted === true,

    chargesEnabled: json.chargesEnabled === true,

    payoutsEnabled: json.payoutsEnabled === true,

    onboardingComplete:

      json.onboardingComplete === true || json.detailsSubmitted === true,

    requirementsCurrentlyDue: stringArray(json.requirementsCurrentlyDue),

    requirementsEventuallyDue: stringArray(json.requirementsEventuallyDue),

    requirementsPastDue: stringArray(json.requirementsPastDue),

    disabledReason:

      typeof json.disabledReason === "string" ? json.disabledReason : null,

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

  };

}



export async function refreshStripeConnectStatus(): Promise<StripeConnectStatus> {

  const userId = await getAuthUserId();

  const url = new URL(CLOUD_VIDEO_WORKER_BASE);

  url.searchParams.set("stripeConnectStatus", "1");



  console.log("[StripeConnect] refresh status", { userId });



  const res = await fetch(url.toString(), {

    method: "GET",

    headers: { "X-App-User-Id": userId },

  });

  const json = await parseWorkerResponse(res);

  if (!res.ok || typeof json.error === "string") {

    throw new Error(formatWorkerError(json, res.status));

  }



  const status = normalizeStatus(json);

  console.log("[StripeConnect] status", {

    accountId: status.accountId,

    charges: status.chargesEnabled,

    payouts: status.payoutsEnabled,

    label: status.userFriendlyStatus,

  });

  return status;

}



export type StartStripeConnectResult =

  | { ok: true; status: StripeConnectStatus }

  | { ok: false; message: string };



/**

 * Opent Stripe Connect onboarding en synchroniseert status na terugkeer.

 */

export async function startStripeConnectOnboarding(): Promise<StartStripeConnectResult> {

  const userId = await getAuthUserId();

  const linkUrl = new URL(CLOUD_VIDEO_WORKER_BASE);

  linkUrl.searchParams.set("stripeConnectOnboardingLink", "1");



  console.log("[StripeConnect] request onboarding link", { userId });



  const linkRes = await fetch(linkUrl.toString(), {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

      "X-App-User-Id": userId,

    },

    body: "{}",

  });

  const linkJson = await parseWorkerResponse(linkRes);

  if (!linkRes.ok || typeof linkJson.error === "string") {

    return {

      ok: false,

      message: formatWorkerError(linkJson, linkRes.status),

    };

  }



  const onboardingUrl =

    typeof linkJson.onboardingUrl === "string" ? linkJson.onboardingUrl : null;

  if (!onboardingUrl) {

    return { ok: false, message: "Geen Stripe onboarding URL ontvangen." };

  }



  console.log("[StripeConnect] open browser", onboardingUrl.slice(0, 80));



  await WebBrowser.openAuthSessionAsync(

    onboardingUrl,

    STRIPE_CONNECT_RETURN_PREFIX

  );



  try {

    const status = await refreshStripeConnectStatus();

    return { ok: true, status };

  } catch (e) {

    const msg = e instanceof Error ? e.message : "Status ophalen mislukt.";

    return { ok: false, message: msg };

  }

}



export type StartPayoutManageResult =

  | { ok: true }

  | { ok: false; message: string };



/**

 * Opent Stripe om uitbetalingsrekening te beheren (geen IBAN in Kwaapo).

 */

export async function startStripePayoutManagement(): Promise<StartPayoutManageResult> {

  const userId = await getAuthUserId();

  const linkUrl = new URL(CLOUD_VIDEO_WORKER_BASE);

  linkUrl.searchParams.set("stripeConnectPayoutManageLink", "1");



  const linkRes = await fetch(linkUrl.toString(), {

    method: "POST",

    headers: {

      "Content-Type": "application/json",

      "X-App-User-Id": userId,

    },

    body: "{}",

  });

  const linkJson = await parseWorkerResponse(linkRes);

  if (!linkRes.ok || typeof linkJson.error === "string") {

    return {

      ok: false,

      message: formatWorkerError(linkJson, linkRes.status),

    };

  }



  const manageUrl =

    typeof linkJson.manageUrl === "string" ? linkJson.manageUrl : null;

  if (!manageUrl) {

    return { ok: false, message: "Geen Stripe beheer-URL ontvangen." };

  }



  await WebBrowser.openAuthSessionAsync(

    manageUrl,

    STRIPE_CONNECT_RETURN_PREFIX

  );



  try {

    await refreshStripeConnectStatus();

    return { ok: true };

  } catch (e) {

    const msg = e instanceof Error ? e.message : "Status ophalen mislukt.";

    return { ok: false, message: msg };

  }

}


