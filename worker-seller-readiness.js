/**
 * Centrale seller payout readiness (server-side).
 * Geen IBAN/KYC opslag — alleen Stripe-status + minimale verificatievelden.
 */

const READINESS_PROFILE_COLUMNS = [
  "id",
  "account_type",
  "seller_type",
  "seller_onboarding_status",
  "business_name",
  "business_email",
  "business_country",
  "business_city",
  "business_postal_code",
  "business_street",
  "business_house_number",
  "kvk_number",
  "kvk_verified_at",
  "kvk_verification_source",
  "stripe_connect_account_id",
  "stripe_connect_onboarding_complete",
  "stripe_charges_enabled",
  "stripe_payouts_enabled",
  "stripe_requirements_currently_due",
  "stripe_requirements_disabled_reason",
  "stripe_status_updated_at",
  "seller_verified_at",
  "seller_rejection_reason",
].join(",");

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

function hasSecret(env, name) {
  const v = env[name];
  return typeof v === "string" && v.length > 0;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
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

export async function fetchReadinessProfile(env, profileId) {
  const rows = await supabaseRequest(
    env,
    "GET",
    `/profiles?id=eq.${encodeURIComponent(profileId)}&select=${READINESS_PROFILE_COLUMNS}&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

export async function fetchProfileByConnectAccountId(env, accountId) {
  const acct = clean(accountId);
  if (!acct.startsWith("acct_")) {
    return null;
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/profiles?stripe_connect_account_id=eq.${encodeURIComponent(acct)}&select=${READINESS_PROFILE_COLUMNS}&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

export function mapStripeAccountToStatus(account, accountId) {
  const req = account?.requirements || {};
  const detailsSubmitted = account?.details_submitted === true;
  const chargesEnabled = account?.charges_enabled === true;
  const payoutsEnabled = account?.payouts_enabled === true;
  const currentlyDue = Array.isArray(req.currently_due) ? req.currently_due : [];
  const pastDue = Array.isArray(req.past_due) ? req.past_due : [];

  return {
    accountId,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    onboardingComplete: detailsSubmitted,
    requirementsCurrentlyDue: currentlyDue,
    requirementsPastDue: pastDue,
    disabledReason:
      typeof req.disabled_reason === "string" ? req.disabled_reason : null,
  };
}

export function isBusinessInfoComplete(profile) {
  if (!profile || profile.seller_type !== "business") {
    return false;
  }
  return (
    clean(profile.business_name).length > 0 &&
    clean(profile.business_email).includes("@") &&
    clean(profile.business_country).length > 0 &&
    clean(profile.business_city).length > 0 &&
    clean(profile.business_postal_code).length > 0 &&
    clean(profile.business_street).length > 0 &&
    clean(profile.business_house_number).length > 0 &&
    clean(profile.kvk_number).length > 0
  );
}

export function isKvkVerificationSatisfied(env, profile) {
  if (!profile || profile.seller_type !== "business") {
    return { satisfied: true, reason: null };
  }
  if (!hasSecret(env, "KVK_API_KEY")) {
    return {
      satisfied: false,
      reason: "kvk_api_not_configured",
      message: "KVK-controle is nog niet geconfigureerd op de server.",
    };
  }
  if (profile.kvk_verified_at) {
    return { satisfied: true, reason: null };
  }
  return {
    satisfied: false,
    reason: "kvk_not_verified",
    message: "KVK-verificatie ontbreekt. Sla je bedrijfsgegevens opnieuw op.",
  };
}

export function isStripePayoutReady(profile, stripeStatus) {
  if (!profile) {
    return false;
  }
  const accountId = clean(profile.stripe_connect_account_id);
  const charges =
    stripeStatus?.chargesEnabled === true || profile.stripe_charges_enabled === true;
  const payouts =
    stripeStatus?.payoutsEnabled === true || profile.stripe_payouts_enabled === true;
  const onboarding =
    stripeStatus?.onboardingComplete === true ||
    profile.stripe_connect_onboarding_complete === true;

  return (
    profile.account_type === "business" &&
    profile.seller_type === "business" &&
    accountId.startsWith("acct_") &&
    onboarding &&
    charges &&
    payouts
  );
}

function deriveSellerOnboardingStatus(profile, checks) {
  if (profile.account_type !== "business" || profile.seller_type !== "business") {
    return "needs_business_info";
  }
  if (!checks.businessInfoComplete) {
    return "needs_business_info";
  }
  if (!checks.kvk.satisfied) {
    if (checks.kvk.reason === "kvk_api_not_configured") {
      return "pending_review";
    }
    return "needs_business_info";
  }
  if (!checks.stripe.hasAccount) {
    return "needs_business_info";
  }
  if (!checks.stripe.onboardingComplete) {
    return "needs_business_info";
  }
  if (
    checks.stripe.hasOpenRequirements ||
    !checks.stripe.chargesEnabled ||
    !checks.stripe.payoutsEnabled
  ) {
    return "pending_review";
  }
  if (checks.payoutReady) {
    return "verified";
  }
  return "pending_review";
}

/**
 * Herberekent seller_onboarding_status + Stripe-velden. Geen gevoelige data loggen.
 * @param {any} env
 * @param {string} profileId
 * @param {{ stripeStatus?: object | null }} options
 */
export async function evaluateSellerPayoutReadiness(env, profileId, options = {}) {
  const profile = await fetchReadinessProfile(env, profileId);
  if (!profile) {
    return {
      profileId,
      found: false,
      payoutReady: false,
      sellerOnboardingStatus: "not_started",
      checks: null,
    };
  }

  const stripeStatus = options.stripeStatus ?? null;
  const accountId = clean(profile.stripe_connect_account_id);
  const currentlyDue =
    stripeStatus?.requirementsCurrentlyDue ??
    (Array.isArray(profile.stripe_requirements_currently_due)
      ? profile.stripe_requirements_currently_due
      : []);
  const disabledReason =
    stripeStatus?.disabledReason ?? profile.stripe_requirements_disabled_reason ?? null;

  const checks = {
    businessInfoComplete: isBusinessInfoComplete(profile),
    kvk: isKvkVerificationSatisfied(env, profile),
    stripe: {
      hasAccount: accountId.startsWith("acct_"),
      onboardingComplete:
        stripeStatus?.onboardingComplete === true ||
        profile.stripe_connect_onboarding_complete === true,
      chargesEnabled:
        stripeStatus?.chargesEnabled === true || profile.stripe_charges_enabled === true,
      payoutsEnabled:
        stripeStatus?.payoutsEnabled === true || profile.stripe_payouts_enabled === true,
      hasOpenRequirements:
        (Array.isArray(currentlyDue) && currentlyDue.length > 0) ||
        (Array.isArray(stripeStatus?.requirementsPastDue) &&
          stripeStatus.requirementsPastDue.length > 0),
      disabledReason,
    },
  };

  checks.payoutReady =
    checks.businessInfoComplete &&
    checks.kvk.satisfied &&
    isStripePayoutReady(profile, stripeStatus);

  const nextStatus = deriveSellerOnboardingStatus(profile, checks);
  const wasVerified = profile.seller_onboarding_status === "verified";
  const now = new Date().toISOString();

  const patch = {
    seller_onboarding_status: nextStatus,
    stripe_status_updated_at: now,
  };

  if (stripeStatus) {
    patch.stripe_connect_onboarding_complete = stripeStatus.onboardingComplete === true;
    patch.stripe_charges_enabled = stripeStatus.chargesEnabled === true;
    patch.stripe_payouts_enabled = stripeStatus.payoutsEnabled === true;
    patch.stripe_requirements_currently_due = stripeStatus.requirementsCurrentlyDue ?? [];
    patch.stripe_requirements_disabled_reason = stripeStatus.disabledReason ?? null;
  }

  if (nextStatus === "verified" && checks.payoutReady) {
    patch.seller_verified_at = profile.seller_verified_at || now;
    patch.seller_rejection_reason = null;
  } else if (wasVerified && nextStatus !== "verified") {
    patch.seller_verified_at = null;
  }

  await supabaseRequest(
    env,
    "PATCH",
    `/profiles?id=eq.${encodeURIComponent(profileId)}`,
    JSON.stringify(patch),
    { preferRepresentation: false }
  );

  console.log("[sellerReadiness] evaluated", {
    profileId,
    nextStatus,
    payoutReady: checks.payoutReady,
    charges: checks.stripe.chargesEnabled,
    payouts: checks.stripe.payoutsEnabled,
    kvk: checks.kvk.satisfied,
    openRequirements: checks.stripe.hasOpenRequirements,
  });

  return {
    profileId,
    found: true,
    payoutReady: checks.payoutReady,
    sellerOnboardingStatus: nextStatus,
    checks,
    stripeStatus,
  };
}

/** Checkout-guard: alle business + KVK + verified + Stripe actief. */
export function isSellerReadyForCheckout(env, profile) {
  if (!profile) {
    return false;
  }
  const kvk = isKvkVerificationSatisfied(env, profile);
  return (
    profile.seller_onboarding_status === "verified" &&
    isBusinessInfoComplete(profile) &&
    kvk.satisfied &&
    isStripePayoutReady(profile, null)
  );
}

/**
 * Verwerk Stripe account.updated webhook (geen gevoelige velden loggen).
 * @param {any} env
 * @param {object} account
 */
export async function handleStripeAccountUpdated(env, account) {
  const accountId = clean(account?.id);
  if (!accountId.startsWith("acct_")) {
    return { handled: false, reason: "invalid_account_id" };
  }

  const profile = await fetchProfileByConnectAccountId(env, accountId);
  if (!profile?.id) {
    console.log("[account.updated] no profile for account", { accountId });
    return { handled: false, reason: "profile_not_found" };
  }

  const stripeStatus = mapStripeAccountToStatus(account, accountId);
  const result = await evaluateSellerPayoutReadiness(env, profile.id, {
    stripeStatus,
  });

  return {
    handled: true,
    profileId: profile.id,
    payoutReady: result.payoutReady,
    sellerOnboardingStatus: result.sellerOnboardingStatus,
  };
}
