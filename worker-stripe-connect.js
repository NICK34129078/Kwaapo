/**

 * Stripe Connect Express onboarding (geen bankgegevens in Supabase).

 * Destination charges: worker-stripe.js

 * Secrets: STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

 * Optional: WORKER_PUBLIC_URL (HTTPS base for account link return/refresh)

 */



import {
  evaluateSellerPayoutReadiness,
} from "./worker-seller-readiness.js";
import { requireAuthUser } from "./worker-auth.js";
import { rpcSetStripeConnectAccount } from "./worker-supabase-rpc.js";

const STRIPE_API = "https://api.stripe.com/v1";

const PROFILE_CONNECT_COLUMNS =

  "id,account_type,seller_type,business_email,business_name,business_country,kvk_number,stripe_connect_account_id,stripe_connect_onboarding_complete,stripe_charges_enabled,stripe_payouts_enabled";



function jsonStripe(data, status = 200, cors = {}) {

  return new Response(JSON.stringify(data), {

    status,

    headers: { "Content-Type": "application/json", ...cors },

  });

}



function isStandardUuid(s) {

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(

    String(s || "")

  );

}



function getSupabaseBase(env) {

  const s = env.SUPABASE_URL;

  if (typeof s !== "string" || s.length < 8) {

    return null;

  }

  return s.replace(/\/$/, "");

}



function getWorkerPublicBase(env) {

  const fromEnv = env.WORKER_PUBLIC_URL;

  if (typeof fromEnv === "string" && fromEnv.startsWith("http")) {

    return fromEnv.replace(/\/$/, "");

  }

  return "https://wild-mountain-072a.n-vandullemen.workers.dev";

}



function hasSecret(env, name) {

  const v = env[name];

  return typeof v === "string" && v.length > 0;

}



async function supabaseRequest(env, method, pathWithQuery, jsonBody, opts) {

  const base = getSupabaseBase(env);

  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) {

    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  }

  const headers = {

    apikey: key,

    Authorization: `Bearer ${key}`,

    "Content-Type": "application/json",

  };

  if (method === "GET" || method === "HEAD") {

    delete headers["Content-Type"];

    headers["Accept"] = "application/json";

  }

  if (method === "PATCH" && opts?.preferRepresentation === false) {

    headers["Prefer"] = "return=minimal";

  }

  const res = await fetch(`${base}/rest/v1${pathWithQuery}`, {

    method,

    headers,

    body: jsonBody != null ? jsonBody : undefined,

  });

  const text = await res.text();

  if (!res.ok) {

    throw new Error(`PostgREST ${res.status}: ${text.slice(0, 500)}`);

  }

  if (res.status === 204 || !text) {

    return null;

  }

  return JSON.parse(text);

}



async function fetchAuthUserEmail(env, userId) {

  const base = getSupabaseBase(env);

  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key || !isStandardUuid(userId)) {

    return null;

  }

  try {

    const res = await fetch(

      `${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`,

      {

        headers: {

          apikey: key,

          Authorization: `Bearer ${key}`,

        },

      }

    );

    if (!res.ok) {

      return null;

    }

    const data = await res.json();

    const email = data?.email;

    return typeof email === "string" && email.includes("@") ? email.trim() : null;

  } catch {

    return null;

  }

}



function stripeFormBody(params) {

  const form = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {

    if (value !== undefined && value !== null && value !== "") {

      form.set(key, String(value));

    }

  }

  return form.toString();

}



function assertStripeSecret(env) {

  const key = env.STRIPE_SECRET_KEY;

  if (!key || typeof key !== "string" || !key.startsWith("sk_")) {

    throw new Error("Missing or invalid STRIPE_SECRET_KEY in Worker secrets");

  }

  return key;

}



async function stripeRequest(env, method, path, params) {

  assertStripeSecret(env);

  const headers = {

    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,

    "Content-Type": "application/x-www-form-urlencoded",

  };

  const body = params != null ? stripeFormBody(params) : undefined;

  const res = await fetch(`${STRIPE_API}${path}`, { method, headers, body });

  const data = await res.json();

  if (!res.ok) {

    const msg =

      data?.error?.message || JSON.stringify(data).slice(0, 300) || res.statusText;

    throw new Error(`Stripe ${res.status}: ${msg}`);

  }

  return data;

}



function htmlPage(title, bodyHtml, cors = {}) {

  const html = `<!DOCTYPE html>

<html lang="nl">

<head>

  <meta charset="utf-8" />

  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>${title}</title>

  <style>

    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #f5f5f5; margin: 0; padding: 32px 20px; text-align: center; }

    h1 { font-size: 1.35rem; margin-bottom: 12px; }

    p { color: #a8a8a8; line-height: 1.5; max-width: 360px; margin: 0 auto 20px; }

  </style>

</head>

<body>${bodyHtml}</body>

</html>`;

  return new Response(html, {

    status: 200,

    headers: { "Content-Type": "text/html; charset=utf-8", ...cors },

  });

}



function payoutStatusLabel(account) {

  if (account?.charges_enabled && account?.payouts_enabled) {

    return "Uitbetalingen actief";

  }

  if (account?.details_submitted) {

    return "Stripe controleert je gegevens";

  }

  return "Uitbetalingen instellen";

}



function mapConnectStatusResponse(account, accountId) {

  const req = account?.requirements || {};

  const detailsSubmitted = account?.details_submitted === true;

  const chargesEnabled = account?.charges_enabled === true;

  const payoutsEnabled = account?.payouts_enabled === true;



  return {

    accountId,

    detailsSubmitted,

    chargesEnabled,

    payoutsEnabled,

    onboardingComplete: detailsSubmitted,

    requirementsCurrentlyDue: Array.isArray(req.currently_due) ? req.currently_due : [],

    requirementsEventuallyDue: Array.isArray(req.eventually_due)

      ? req.eventually_due

      : [],

    requirementsPastDue: Array.isArray(req.past_due) ? req.past_due : [],

    disabledReason:

      typeof req.disabled_reason === "string" ? req.disabled_reason : null,

    userFriendlyStatus: payoutStatusLabel(account),

    statusLabel: payoutStatusLabel(account),

  };

}



function resolveConnectStateFromMapped(mapped) {

  const accountId = String(mapped?.accountId || "").trim();

  if (!accountId.startsWith("acct_")) {

    return "not_started";

  }

  if (mapped?.disabledReason) {

    return "restricted";

  }

  const detailsSubmitted = mapped?.detailsSubmitted === true;

  const chargesEnabled = mapped?.chargesEnabled === true;

  const payoutsEnabled = mapped?.payoutsEnabled === true;

  const currentlyDue = Array.isArray(mapped?.requirementsCurrentlyDue)

    ? mapped.requirementsCurrentlyDue

    : [];

  const pastDue = Array.isArray(mapped?.requirementsPastDue)

    ? mapped.requirementsPastDue

    : [];



  if (

    chargesEnabled &&

    payoutsEnabled &&

    detailsSubmitted &&

    currentlyDue.length === 0 &&

    pastDue.length === 0

  ) {

    return "ready";

  }

  if (detailsSubmitted) {

    if (currentlyDue.length > 0 || pastDue.length > 0) {

      return "pending_verification";

    }

    return "details_submitted";

  }

  return "onboarding_incomplete";

}



function canProceedToStep3FromMapped(mapped) {

  const currentlyDue = Array.isArray(mapped?.requirementsCurrentlyDue)

    ? mapped.requirementsCurrentlyDue

    : [];

  return mapped?.detailsSubmitted === true && currentlyDue.length === 0;

}



function buildPublicStatusPayload(mapped, extra = {}) {

  const currentlyDue = Array.isArray(mapped?.requirementsCurrentlyDue)

    ? mapped.requirementsCurrentlyDue

    : [];

  const pastDue = Array.isArray(mapped?.requirementsPastDue)

    ? mapped.requirementsPastDue

    : [];

  const state = resolveConnectStateFromMapped(mapped);

  const canProceedToStep3 = canProceedToStep3FromMapped(mapped);



  return {

    success: true,

    state,

    accountId:

      typeof mapped?.accountId === "string" && mapped.accountId.startsWith("acct_")

        ? mapped.accountId

        : null,

    detailsSubmitted: mapped?.detailsSubmitted === true,

    chargesEnabled: mapped?.chargesEnabled === true,

    payoutsEnabled: mapped?.payoutsEnabled === true,

    onboardingComplete:

      mapped?.onboardingComplete === true || mapped?.detailsSubmitted === true,

    currentlyDueCount: currentlyDue.length,

    pastDueCount: pastDue.length,

    disabledReason: mapped?.disabledReason ?? null,

    canProceedToStep3,

    requirementsCurrentlyDue: currentlyDue,

    requirementsPastDue: pastDue,

    requirementsEventuallyDue: Array.isArray(mapped?.requirementsEventuallyDue)

      ? mapped.requirementsEventuallyDue

      : [],

    userFriendlyStatus:

      mapped?.userFriendlyStatus ?? mapped?.statusLabel ?? "Uitbetalingen instellen",

    statusLabel:

      mapped?.statusLabel ?? mapped?.userFriendlyStatus ?? "Uitbetalingen instellen",

    ...extra,

  };

}



async function fetchSellerProfile(env, userId) {

  const rows = await supabaseRequest(

    env,

    "GET",

    `/profiles?id=eq.${encodeURIComponent(userId)}&select=${PROFILE_CONNECT_COLUMNS}&limit=1`

  );

  if (Array.isArray(rows) && rows.length > 0) {

    return rows[0];

  }

  return null;

}



async function patchProfileConnect(env, userId, patch) {
  if (patch?.stripe_connect_account_id) {
    const saved = await rpcSetStripeConnectAccount(
      env,
      userId,
      patch.stripe_connect_account_id
    );
    console.log("[stripeConnect] STRIPE_CONNECT_ACCOUNT_SAVED", {
      userIdPrefix: String(userId).slice(0, 8),
      reused: saved.reused === true,
      created: saved.created === true,
    });
    return;
  }
  throw new Error("patchProfileConnect: only stripe_connect_account_id is supported via RPC");
}



function mapCountryCode(profile) {

  const raw = String(profile?.business_country || "NL").trim().toUpperCase();

  if (raw === "NEDERLAND" || raw === "THE NETHERLANDS") {

    return "NL";

  }

  if (raw.length === 2) {

    return raw;

  }

  return "NL";

}



function stripeBusinessType(profile) {

  return profile?.seller_type === "individual" ? "individual" : "company";

}



async function resolveConnectEmail(env, profile, userId) {

  const businessEmail = String(profile?.business_email || "").trim();

  if (businessEmail.includes("@")) {

    return businessEmail;

  }

  return (await fetchAuthUserEmail(env, userId)) || undefined;

}



async function createConnectAccount(env, profile, userId) {

  const email = await resolveConnectEmail(env, profile, userId);

  const params = {

    type: "express",

    country: mapCountryCode(profile),

    email,

    business_type: stripeBusinessType(profile),

    "capabilities[card_payments][requested]": "true",

    "capabilities[transfers][requested]": "true",

    "metadata[user_id]": userId,

    "metadata[profile_id]": userId,

  };

  if (profile?.business_name) {

    params["business_profile[name]"] = String(profile.business_name).slice(0, 120);

    params["metadata[business_name]"] = String(profile.business_name).slice(0, 120);

  }

  if (profile?.kvk_number) {

    params["metadata[kvk_number]"] = String(profile.kvk_number).slice(0, 32);

  }

  console.log("[stripeConnectAccount] creating", {

    country: params.country,

    business_type: params.business_type,

    hasEmail: !!email,

  });

  return stripeRequest(env, "POST", "/accounts", params);

}



async function ensureConnectAccount(env, profile, userId) {

  const existing = String(profile?.stripe_connect_account_id || "").trim();

  if (existing.startsWith("acct_")) {
    console.log("[stripeConnect] STRIPE_CONNECT_EXISTING_ACCOUNT", {
      userIdPrefix: String(userId).slice(0, 8),
      accountPrefix: existing.slice(0, 10),
    });
    return existing;

  }

  console.log("[stripeConnect] STRIPE_CONNECT_ACCOUNT_CREATED", {
    userIdPrefix: String(userId).slice(0, 8),
  });

  const account = await createConnectAccount(env, profile, userId);

  if (!account?.id) {

    throw new Error("Stripe Connect account heeft geen id");

  }

  await patchProfileConnect(env, userId, {

    stripe_connect_account_id: account.id,

  });

  return account.id;

}



async function syncConnectStatusFromStripe(env, userId, accountId) {

  const account = await stripeRequest(

    env,

    "GET",

    `/accounts/${encodeURIComponent(accountId)}`,

    null

  );

  const mapped = mapConnectStatusResponse(account, accountId);

  console.log("STRIPE_STATUS_ACCOUNT_FETCHED", {
    userIdPrefix: String(userId).slice(0, 8),
    accountPrefix: String(accountId).slice(0, 10),
  });
  console.log("STRIPE_STATUS_DETAILS_SUBMITTED", {
    detailsSubmitted: mapped.detailsSubmitted === true,
  });
  console.log("STRIPE_STATUS_CHARGES_ENABLED", {
    chargesEnabled: mapped.chargesEnabled === true,
  });
  console.log("STRIPE_STATUS_PAYOUTS_ENABLED", {
    payoutsEnabled: mapped.payoutsEnabled === true,
  });
  console.log("STRIPE_STATUS_CURRENTLY_DUE_COUNT", {
    currentlyDueCount: Array.isArray(mapped.requirementsCurrentlyDue)
      ? mapped.requirementsCurrentlyDue.length
      : 0,
  });

  const readiness = await evaluateSellerPayoutReadiness(env, userId, {

    stripeStatus: mapped,

  });



  return {

    ...mapped,

    payoutReady: readiness.payoutReady,

    sellerOnboardingStatus: readiness.sellerOnboardingStatus,

    readinessChecks: readiness.checks,

  };

}



function requireBusinessSeller(profile) {

  if (!profile) {

    throw new Error("Profiel niet gevonden");

  }

  if (profile.account_type !== "business") {

    throw new Error("Alleen business accounts kunnen Stripe Connect gebruiken");

  }

}



/**

 * POST ?stripeConnectAccount=1

 */

export async function handleStripeConnectAccount(request, env, cors = {}) {

  const logPrefix = "[stripeConnectAccount]";

  try {

    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;



    const profile = await fetchSellerProfile(env, userId);

    requireBusinessSeller(profile);



    const accountId = await ensureConnectAccount(env, profile, userId);

    console.log(logPrefix, "ok", { userId, accountId });



    return jsonStripe(

      { accountId, created: !profile.stripe_connect_account_id },

      200,

      cors

    );

  } catch (e) {

    const message = (e && e.message) || String(e);

    console.error(logPrefix, message);

    return jsonStripe({ error: message, step: "stripe_connect_account" }, 500, cors);

  }

}



/**

 * POST ?stripeConnectOnboardingLink=1

 */

export async function handleStripeConnectOnboardingLink(request, env, cors = {}) {

  const logPrefix = "[stripeConnectOnboardingLink]";

  try {

    console.log("[stripeConnect] STRIPE_CONNECT_START");
    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;
    console.log("[stripeConnect] STRIPE_CONNECT_AUTH_VERIFIED", {
      userIdPrefix: String(userId).slice(0, 8),
    });



    const profile = await fetchSellerProfile(env, userId);

    requireBusinessSeller(profile);



    const accountId = await ensureConnectAccount(env, profile, userId);

    const account = await stripeRequest(

      env,

      "GET",

      `/accounts/${encodeURIComponent(accountId)}`,

      null

    );

    const mapped = mapConnectStatusResponse(account, accountId);

    await evaluateSellerPayoutReadiness(env, userId, { stripeStatus: mapped });



    if (canProceedToStep3FromMapped(mapped)) {

      console.log(logPrefix, "already_complete", {

        userIdPrefix: String(userId).slice(0, 8),

        state: resolveConnectStateFromMapped(mapped),

      });

      return jsonStripe(

        {

          ...buildPublicStatusPayload(mapped, {

            alreadyComplete: true,

            onboardingUrl: null,

          }),

          payoutReady: false,

        },

        200,

        cors

      );

    }



    const base = getWorkerPublicBase(env);

    const linkType = mapped.detailsSubmitted ? "account_update" : "account_onboarding";

    const link = await stripeRequest(env, "POST", "/account_links", {

      account: accountId,

      refresh_url: `${base}?stripeConnectRefresh=1`,

      return_url: `${base}?stripeConnectReturn=1`,

      type: linkType,

    });



    if (!link?.url) {

      throw new Error("Stripe account link heeft geen url");

    }

    console.log("[stripeConnect] STRIPE_CONNECT_LINK_CREATED", {
      userIdPrefix: String(userId).slice(0, 8),
      accountPrefix: String(accountId).slice(0, 10),
      linkType,
    });

    console.log(logPrefix, "ok", { userId, accountId, linkType });

    return jsonStripe({ onboardingUrl: link.url, accountId, linkType }, 200, cors);

  } catch (e) {

    const message = (e && e.message) || String(e);

    console.error(logPrefix, message);

    return jsonStripe({ error: message, step: "stripe_connect_link" }, 500, cors);

  }

}



/**

 * GET ?stripeConnectStatus=1

 */

export async function handleStripeConnectStatus(request, env, cors = {}) {

  const logPrefix = "[stripeConnectStatus]";

  try {

    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;



    const profile = await fetchSellerProfile(env, userId);

    requireBusinessSeller(profile);



    const accountId = String(profile.stripe_connect_account_id || "").trim();

    if (!accountId.startsWith("acct_")) {

      const readiness = await evaluateSellerPayoutReadiness(env, userId, {});

      const emptyMapped = {

        accountId: null,

        detailsSubmitted: false,

        chargesEnabled: false,

        payoutsEnabled: false,

        onboardingComplete: false,

        requirementsCurrentlyDue: [],

        requirementsEventuallyDue: [],

        requirementsPastDue: [],

        disabledReason: null,

        userFriendlyStatus: "Uitbetalingen instellen",

        statusLabel: "Uitbetalingen instellen",

      };

      return jsonStripe(

        {

          ...buildPublicStatusPayload(emptyMapped, {

            payoutReady: readiness.payoutReady,

            sellerOnboardingStatus: readiness.sellerOnboardingStatus,

          }),

        },

        200,

        cors

      );

    }



    const status = await syncConnectStatusFromStripe(env, userId, accountId);

    console.log(logPrefix, "ok", {

      accountPrefix: String(status.accountId || "").slice(0, 10),

      state: resolveConnectStateFromMapped(status),

      canProceedToStep3: canProceedToStep3FromMapped(status),

      charges: status.chargesEnabled,

      payouts: status.payoutsEnabled,

      currentlyDueCount: Array.isArray(status.requirementsCurrentlyDue)

        ? status.requirementsCurrentlyDue.length

        : 0,

    });

    return jsonStripe(

      buildPublicStatusPayload(status, {

        payoutReady: status.payoutReady,

        sellerOnboardingStatus: status.sellerOnboardingStatus,

      }),

      200,

      cors

    );

  } catch (e) {

    const message = (e && e.message) || String(e);

    console.error(logPrefix, message);

    return jsonStripe({ error: message, step: "stripe_connect_status" }, 500, cors);

  }

}



/**

 * GET ?stripeConnectReturn=1

 */

export async function handleStripeConnectReturn(request, url, env, cors = {}) {

  return htmlPage(

    "Terug naar de app",

    "<h1>Klaar</h1><p>Je kunt dit venster sluiten en teruggaan naar de app. Open de app om je Stripe-status te vernieuwen.</p>",

    cors

  );

}



/**

 * GET ?stripeConnectRefresh=1

 */

export async function handleStripeConnectRefresh(request, url, env, cors = {}) {

  return htmlPage(

    "Sessie verlopen",

    "<h1>Sessie verlopen</h1><p>Je onboarding sessie is verlopen. Ga terug naar de app en probeer opnieuw.</p>",

    cors

  );

}



/**
 * POST ?stripeConnectPayoutManageLink=1

 * Opent Stripe Hosted Onboarding (nog niet klaar) of Express Dashboard (actief).

 * Geen IBAN opslag in Kwaapo.

 */

export async function handleStripeConnectPayoutManageLink(request, env, cors = {}) {

  const logPrefix = "[stripeConnectPayoutManageLink]";

  try {

    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;



    const profile = await fetchSellerProfile(env, userId);

    requireBusinessSeller(profile);



    const accountId = await ensureConnectAccount(env, profile, userId);

    const account = await stripeRequest(

      env,

      "GET",

      `/accounts/${encodeURIComponent(accountId)}`,

      null

    );

    const mapped = mapConnectStatusResponse(account, accountId);

    const base = getWorkerPublicBase(env);



    let manageUrl = null;

    if (mapped.chargesEnabled && mapped.payoutsEnabled) {

      const login = await stripeRequest(

        env,

        "POST",

        `/accounts/${encodeURIComponent(accountId)}/login_links`,

        {}

      );

      manageUrl = login?.url ?? null;

    } else {

      const link = await stripeRequest(env, "POST", "/account_links", {

        account: accountId,

        refresh_url: `${base}?stripeConnectRefresh=1`,

        return_url: `${base}?stripeConnectReturn=1`,

        type: "account_onboarding",

      });

      manageUrl = link?.url ?? null;

    }



    if (!manageUrl) {

      throw new Error("Stripe beheerkoppeling heeft geen url");

    }



    await evaluateSellerPayoutReadiness(env, userId, { stripeStatus: mapped });



    console.log(logPrefix, "ok", { userId, accountId, expressDashboard: mapped.chargesEnabled && mapped.payoutsEnabled });

    return jsonStripe({ manageUrl, accountId }, 200, cors);

  } catch (e) {

    const message = (e && e.message) || String(e);

    console.error(logPrefix, message);

    return jsonStripe({ error: message, step: "stripe_connect_payout_manage" }, 500, cors);

  }

}


