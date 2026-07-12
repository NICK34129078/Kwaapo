/**
 * PostgREST RPC helpers for server-side profile patches (service_role only).
 */

function getSupabaseBase(env) {
  const s = env.SUPABASE_URL;
  if (typeof s !== "string" || s.length < 8) {
    return null;
  }
  return s.replace(/\/$/, "");
}

function getServiceRoleKey(env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof key === "string" && key.length > 0 ? key : null;
}

export async function supabaseRpc(env, functionName, body) {
  const base = getSupabaseBase(env);
  const key = getServiceRoleKey(env);
  if (!base || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const res = await fetch(`${base}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  if (!res.ok) {
    let errorCode = null;
    let errorMessage = text.slice(0, 500);
    let errorDetails = null;
    let errorHint = null;
    try {
      const parsed = JSON.parse(text);
      errorCode = parsed?.code ?? null;
      errorMessage = parsed?.message ?? errorMessage;
      errorDetails = parsed?.details ?? null;
      errorHint = parsed?.hint ?? null;
    } catch {
      // keep raw text slice
    }
    console.error("STRIPE_STATUS_RPC_HTTP_STATUS", res.status);
    console.error("STRIPE_STATUS_RPC_ERROR_CODE", errorCode);
    console.error("STRIPE_STATUS_RPC_ERROR_MESSAGE", errorMessage);
    console.error("STRIPE_STATUS_RPC_ERROR_DETAILS", errorDetails);
    console.error("STRIPE_STATUS_RPC_ERROR_HINT", errorHint);
    throw new Error(`PostgREST ${res.status}: ${errorMessage}`);
  }
  if (!text.trim()) {
    return null;
  }
  const parsed = JSON.parse(text);
  console.log("STRIPE_STATUS_RPC_RESPONSE", {
    success: parsed?.success === true,
    error: typeof parsed?.error === "string" ? parsed.error : null,
  });
  return parsed;
}

export async function rpcSyncSellerPayoutReadiness(env, userId, patch) {
  const patchKeys = patch && typeof patch === "object" ? Object.keys(patch) : [];
  console.log("STRIPE_STATUS_RPC_START", {
    userIdPrefix: String(userId).slice(0, 8),
    patchKeys,
  });

  const result = await supabaseRpc(env, "sync_profile_seller_payout_readiness", {
    p_user_id: userId,
    p_patch: patch,
  });
  if (!result || result.success !== true) {
    const reason = result?.error ?? "readiness_sync_failed";
    console.error("STRIPE_STATUS_RPC_ERROR_MESSAGE", reason);
    throw new Error(`Seller readiness sync mislukt (${reason})`);
  }
  console.log("STRIPE_STATUS_RPC_SUCCESS", {
    userIdPrefix: String(userId).slice(0, 8),
  });
  return result;
}

export async function rpcSetStripeConnectAccount(env, userId, accountId) {
  const result = await supabaseRpc(env, "set_profile_stripe_connect_account", {
    p_user_id: userId,
    p_account_id: accountId,
  });
  if (!result || result.success !== true) {
    const reason = result?.error ?? "stripe_account_save_failed";
    throw new Error(`Stripe account opslaan mislukt (${reason})`);
  }
  return {
    accountId: typeof result.account_id === "string" ? result.account_id : accountId,
    reused: result.reused === true,
    created: result.created === true,
  };
}
