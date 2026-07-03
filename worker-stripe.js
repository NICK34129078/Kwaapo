import {
  handleStripeAccountUpdated,
  isSellerReadyForCheckout,
} from "./worker-seller-readiness.js";
import { requireAuthUser } from "./worker-auth.js";
import {
  buildRefundNotificationCopy,
  isFullChargeRefundSucceeded,
  isRefundUpdatedFailed,
  isRetriableRefundApplyError,
  shouldSendRefundNotifications,
} from "./order-refund-logic.js";
import {
  reconcileOutcome,
  shouldAttemptStockReconcile,
  shouldInitiateAutoRefund,
  shouldNotifySellerOnPaid,
} from "./order-reconciliation-logic.js";

/**
 * Stripe Checkout — server-side only.
 * Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, CHECKOUT_SUCCESS_URL, CHECKOUT_CANCEL_URL
 */

const STRIPE_API = "https://api.stripe.com/v1";

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
  if (method === "POST" && jsonBody != null && opts?.preferRepresentation !== false) {
    headers["Prefer"] = "return=representation";
  }
  if (method === "POST" && opts?.preferIgnoreDuplicates) {
    headers["Prefer"] = opts?.preferRepresentation === false
      ? "return=minimal,resolution=ignore-duplicates"
      : "return=representation,resolution=ignore-duplicates";
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

async function fetchOrderById(env, orderId) {
  const rows = await supabaseRequest(
    env,
    "GET",
    `/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

async function fetchFirstOrderItem(env, orderId) {
  const rows = await supabaseRequest(
    env,
    "GET",
    `/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=id,product_id,product_variant_id,selected_variant_type,selected_variant_value,quantity,unit_price,size&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0];
}

async function fetchProductVariantForCheckout(env, variantId, productId) {
  if (!isStandardUuid(variantId)) {
    return null;
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/product_variants?id=eq.${encodeURIComponent(variantId)}&product_id=eq.${encodeURIComponent(productId)}&select=id,product_id,option_value,stock,is_active&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

async function fetchProductForCheckout(env, productId) {
  if (!isStandardUuid(productId)) {
    return null;
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/products?id=eq.${encodeURIComponent(productId)}&select=id,name,price,stock,is_active,owner_id,uses_variants,variants_ready&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

function roundMoney(amount) {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (!Number.isFinite(n)) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

function computePlatformFeeAmount(subtotal) {
  const raw = roundMoney(subtotal * PLATFORM_FEE_RATE);
  return Math.min(raw, Math.max(0, roundMoney(subtotal - 0.01)));
}

function computeSellerAmount(subtotal, platformFee) {
  return roundMoney(subtotal - platformFee);
}

/**
 * Valideer order tegen live product DB; sync prijs/voorraad server-side.
 * @returns {{ ok: true, subtotalCents: number, productName: string, feeCents: number } | { ok: false, error: string, step: string }}
 */
async function validateAndSyncOrderForCheckout(env, order, orderItem) {
  if (!orderItem?.product_id) {
    return { ok: false, error: "Bestelling heeft geen product.", step: "no_product" };
  }

  const product = await fetchProductForCheckout(env, orderItem.product_id);
  if (!product) {
    return { ok: false, error: "Product niet gevonden.", step: "product_not_found" };
  }
  if (product.is_active !== true) {
    return {
      ok: false,
      error: "Dit product is momenteel niet beschikbaar.",
      step: "product_inactive",
    };
  }
  if (product.owner_id !== order.seller_id) {
    return { ok: false, error: "Verkoper komt niet overeen.", step: "seller_mismatch" };
  }

  const quantity = Math.max(1, Math.floor(Number(orderItem.quantity) || 1));
  const usesVariantCheckout =
    product.uses_variants === true && product.variants_ready === true;

  let stock = Math.floor(Number(product.stock) || 0);

  if (usesVariantCheckout) {
    if (!orderItem.product_variant_id) {
      return {
        ok: false,
        error: "Kies eerst een maat.",
        step: "variant_required",
      };
    }
    const variant = await fetchProductVariantForCheckout(
      env,
      orderItem.product_variant_id,
      orderItem.product_id
    );
    if (!variant || variant.is_active !== true) {
      return {
        ok: false,
        error: "De gekozen maat is niet beschikbaar.",
        step: "variant_not_found",
      };
    }
    stock = Math.floor(Number(variant.stock) || 0);
    if (stock < quantity) {
      return {
        ok: false,
        error: "De gekozen maat is niet op voorraad.",
        step: "out_of_stock",
      };
    }
  } else if (stock < quantity) {
    return {
      ok: false,
      error: "Dit product is niet op voorraad.",
      step: "out_of_stock",
    };
  }

  const unitPrice = roundMoney(parseFloat(String(product.price)));
  const subtotal = roundMoney(unitPrice * quantity);
  const platformFee = computePlatformFeeAmount(subtotal);
  const sellerAmount = computeSellerAmount(subtotal, platformFee);

  const storedSubtotal = roundMoney(parseFloat(String(order.subtotal_amount)));
  const storedUnit = roundMoney(parseFloat(String(orderItem.unit_price)));

  if (storedSubtotal !== subtotal || storedUnit !== unitPrice) {
    await supabaseRequest(
      env,
      "PATCH",
      `/orders?id=eq.${encodeURIComponent(order.id)}`,
      JSON.stringify({
        subtotal_amount: subtotal,
        platform_fee_amount: platformFee,
        seller_amount: sellerAmount,
      }),
      { preferRepresentation: false }
    );
    if (orderItem.id) {
      await supabaseRequest(
        env,
        "PATCH",
        `/order_items?id=eq.${encodeURIComponent(orderItem.id)}`,
        JSON.stringify({ unit_price: unitPrice, quantity }),
        { preferRepresentation: false }
      );
    }
    console.log("[stripeCheckout] synced order amounts from product DB", {
      orderId: order.id,
      subtotal,
      unitPrice,
    });
  }

  const subtotalCents = amountToCents(subtotal);
  if (subtotalCents < 50) {
    return {
      ok: false,
      error: "Order amount too low for Stripe",
      step: "amount_too_low",
    };
  }

  return {
    ok: true,
    subtotalCents,
    productName: String(product.name || "Bestelling"),
    feeCents: applicationFeeCents(subtotalCents),
    productId: product.id,
  };
}

async function callOrderStockRpc(env, functionName, orderId) {
  const result = await supabaseRequest(
    env,
    "POST",
    `/rpc/${functionName}`,
    JSON.stringify({ p_order_id: orderId }),
    { preferRepresentation: false }
  );
  return result === true;
}

async function callOrderStockRpcJson(env, functionName, orderId) {
  return supabaseRequest(
    env,
    "POST",
    `/rpc/${functionName}`,
    JSON.stringify({ p_order_id: orderId }),
    { preferRepresentation: false }
  );
}

async function reserveProductStockForOrder(env, orderId) {
  return callOrderStockRpc(env, "reserve_product_stock_for_order", orderId);
}

async function commitProductStockForOrder(env, orderId) {
  return callOrderStockRpc(env, "commit_product_stock_for_order", orderId);
}

async function releaseProductStockForOrder(env, orderId) {
  return callOrderStockRpc(env, "release_product_stock_for_order", orderId);
}

async function reconcileProductStockForPaidOrder(env, orderId) {
  return callOrderStockRpcJson(
    env,
    "reconcile_product_stock_for_paid_order",
    orderId
  );
}

async function patchOrderFields(env, orderId, patch) {
  const updated = await supabaseRequest(
    env,
    "PATCH",
    `/orders?id=eq.${encodeURIComponent(orderId)}`,
    JSON.stringify(patch),
    { preferRepresentation: true }
  );
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    throw new Error(`PostgREST: order ${orderId} not updated (0 rows)`);
  }
  return updated;
}

async function resolveStripeChargeIdFromPaymentIntent(env, paymentIntentId) {
  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    return null;
  }
  try {
    const pi = await stripeRequest(
      env,
      "GET",
      `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`
    );
    const latest = pi?.latest_charge;
    if (typeof latest === "string" && latest.startsWith("ch_")) {
      return latest;
    }
    if (latest && typeof latest.id === "string") {
      return latest.id;
    }
  } catch (e) {
    console.warn(
      "[resolveStripeChargeIdFromPaymentIntent]",
      paymentIntentId,
      e instanceof Error ? e.message : String(e)
    );
  }
  return null;
}

async function applyFullOrderRefundRpc(
  env,
  orderId,
  stripeEventId,
  amountRefundedCents,
  chargeId
) {
  return supabaseRequest(
    env,
    "POST",
    "/rpc/apply_full_order_refund",
    JSON.stringify({
      p_order_id: orderId,
      p_stripe_event_id: stripeEventId,
      p_amount_refunded_cents: amountRefundedCents,
      p_charge_id: chargeId || null,
    }),
    { preferRepresentation: false }
  );
}

const PLATFORM_FEE_RATE = 0.125;
/** Stripe Checkout Session TTL (min 30 min per Stripe API). */
const CHECKOUT_SESSION_EXPIRES_SECONDS = 30 * 60;

const SELLER_CHECKOUT_COLUMNS =
  "id,account_type,seller_type,seller_onboarding_status,stripe_connect_account_id,stripe_connect_onboarding_complete,stripe_charges_enabled,stripe_payouts_enabled,kvk_number,kvk_verified_at,business_name,business_email,business_country,business_city,business_postal_code,business_street,business_house_number";

async function fetchSellerProfileForCheckout(env, sellerId) {
  const rows = await supabaseRequest(
    env,
    "GET",
    `/profiles?id=eq.${encodeURIComponent(sellerId)}&select=${SELLER_CHECKOUT_COLUMNS}&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

function isSellerReadyForDestinationCharge(env, profile) {
  return isSellerReadyForCheckout(env, profile);
}

/** Platform fee in cents; min 1 cent naar connected account. */
function applicationFeeCents(subtotalCents) {
  const raw = Math.round(subtotalCents * PLATFORM_FEE_RATE);
  const capped = Math.min(raw, Math.max(0, subtotalCents - 1));
  return Math.max(0, capped);
}

async function fetchProductName(env, productId) {
  if (!isStandardUuid(productId)) {
    return "Bestelling";
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/products?id=eq.${encodeURIComponent(productId)}&select=name&limit=1`
  );
  if (Array.isArray(rows) && rows[0]?.name) {
    return String(rows[0].name);
  }
  return "Bestelling";
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
    throw new Error(
      "Missing or invalid STRIPE_SECRET_KEY in Worker secrets (verwacht sk_test_... of sk_live_...)"
    );
  }
  return key;
}

async function stripeRequest(env, method, path, params, options = {}) {
  assertStripeSecret(env);
  const key = env.STRIPE_SECRET_KEY;
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = String(options.idempotencyKey);
  }
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

function checkoutReturnUrls(env, overrides = {}) {
  const success =
    overrides.successUrl ||
    env.CHECKOUT_SUCCESS_URL ||
    "lumen-fashion://checkout/success?session_id={CHECKOUT_SESSION_ID}";
  const cancel =
    overrides.cancelUrl ||
    env.CHECKOUT_CANCEL_URL ||
    "lumen-fashion://checkout/cancel";
  return { success, cancel };
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
    a { color: #b9d9f7; font-weight: 700; text-decoration: none; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
  });
}

function amountToCents(amount) {
  const n = typeof amount === "number" ? amount : parseFloat(String(amount));
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.round(n * 100);
}

async function initiateAutoRefundForUnavailableStock(
  env,
  orderId,
  order,
  paymentIntentId
) {
  if (
    !shouldInitiateAutoRefund({
      paymentStatus: order?.payment_status,
      refundRequestedAt: order?.refund_requested_at,
      fulfillmentStatus: order?.fulfillment_status,
    })
  ) {
    return { skipped: true, reason: "not_eligible" };
  }

  let stripeChargeId = order?.stripe_charge_id || null;
  if (!stripeChargeId && paymentIntentId) {
    stripeChargeId = await resolveStripeChargeIdFromPaymentIntent(
      env,
      paymentIntentId
    );
  }

  if (!stripeChargeId) {
    await patchOrderFields(env, orderId, {
      fulfillment_status: "manual_review",
      fulfillment_exception_at:
        order?.fulfillment_exception_at || new Date().toISOString(),
    });
    console.warn(
      "[initiateAutoRefundForUnavailableStock] no charge id — manual_review",
      orderId
    );
    return { ok: false, reason: "no_charge" };
  }

  try {
    const refund = await stripeRequest(
      env,
      "POST",
      "/refunds",
      {
        charge: stripeChargeId,
        reverse_transfer: "true",
        refund_application_fee: "true",
        metadata: {
          order_id: orderId,
          reason: "stock_unavailable",
        },
      },
      { idempotencyKey: `auto-refund-unavailable-${orderId}` }
    );

    await patchOrderFields(env, orderId, {
      refund_requested_at: new Date().toISOString(),
      fulfillment_status: "refund_pending",
      stripe_refund_id: refund?.id || null,
      stripe_charge_id: stripeChargeId,
    });
    console.log(
      "[initiateAutoRefundForUnavailableStock] ok",
      orderId,
      refund?.id ?? null
    );
    return { ok: true, refundId: refund?.id ?? null };
  } catch (e) {
    console.error(
      "[initiateAutoRefundForUnavailableStock] failed",
      orderId,
      e instanceof Error ? e.message : String(e)
    );
    await patchOrderFields(env, orderId, {
      fulfillment_status: "manual_review",
      fulfillment_exception_at:
        order?.fulfillment_exception_at || new Date().toISOString(),
    });
    return {
      ok: false,
      reason: "refund_failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function markOrderPaid(env, orderId, sessionId, paymentIntentId) {
  const order = await fetchOrderById(env, orderId);
  if (order?.payment_status === "paid") {
    if (
      shouldInitiateAutoRefund({
        paymentStatus: order.payment_status,
        refundRequestedAt: order.refund_requested_at,
        fulfillmentStatus: order.fulfillment_status,
      })
    ) {
      await initiateAutoRefundForUnavailableStock(
        env,
        orderId,
        order,
        paymentIntentId
      );
    }
    await ensureSellerNewPaidOrderNotification(env, orderId);
    console.log("[markOrderPaid] already paid", orderId);
    return;
  }

  let fulfillmentStatus = "committed";
  let paymentReconciledAt = null;

  const committed = await commitProductStockForOrder(env, orderId);
  if (!committed) {
    if (
      shouldAttemptStockReconcile({
        stockCommittedAt: order?.stock_committed_at,
        stockReleasedAt: order?.stock_released_at,
      })
    ) {
      const reconcileResult = await reconcileProductStockForPaidOrder(
        env,
        orderId
      );
      const outcome = reconcileOutcome(reconcileResult);
      if (outcome === "reconciled") {
        fulfillmentStatus = "reconciled";
        paymentReconciledAt = new Date().toISOString();
      } else if (outcome === "already_committed") {
        fulfillmentStatus = "committed";
      } else if (outcome === "stock_unavailable") {
        fulfillmentStatus = "stock_unavailable";
      } else {
        throw new Error(
          `[markOrderPaid] reconcile failed for order ${orderId}: ${JSON.stringify(reconcileResult)}`
        );
      }
    } else {
      throw new Error(
        `[markOrderPaid] stock commit failed for order ${orderId} — refusing to mark paid without active reservation`
      );
    }
  }

  let stripeChargeId = order?.stripe_charge_id || null;
  if (!stripeChargeId && paymentIntentId) {
    stripeChargeId = await resolveStripeChargeIdFromPaymentIntent(
      env,
      paymentIntentId
    );
  }

  const patch = {
    status: "paid",
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    fulfillment_status: fulfillmentStatus,
  };
  if (sessionId) {
    patch.stripe_checkout_session_id = sessionId;
  }
  if (paymentIntentId) {
    patch.stripe_payment_intent_id = paymentIntentId;
  }
  if (stripeChargeId) {
    patch.stripe_charge_id = stripeChargeId;
  }
  if (paymentReconciledAt) {
    patch.payment_reconciled_at = paymentReconciledAt;
  }
  if (fulfillmentStatus === "stock_unavailable") {
    patch.fulfillment_exception_at = new Date().toISOString();
  }

  await patchOrderFields(env, orderId, patch);
  console.log(
    "[markOrderPaid] ok",
    orderId,
    fulfillmentStatus,
    stripeChargeId ? "charge stored" : "no charge id"
  );

  if (fulfillmentStatus === "stock_unavailable") {
    const refreshed = await fetchOrderById(env, orderId);
    await initiateAutoRefundForUnavailableStock(
      env,
      orderId,
      refreshed,
      paymentIntentId
    );
    return;
  }

  await ensureSellerNewPaidOrderNotification(env, orderId, fulfillmentStatus);
}

async function fetchProductNameById(env, productId) {
  if (!isStandardUuid(productId)) {
    return "Product";
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/products?id=eq.${encodeURIComponent(productId)}&select=name&limit=1`
  );
  if (Array.isArray(rows) && rows.length > 0 && rows[0]?.name) {
    return String(rows[0].name);
  }
  return "Product";
}

/**
 * Idempotent seller alert after payment. Never throws — checkout must not fail on notify errors.
 * @param {Record<string, unknown>} env
 * @param {string} orderId
 * @param {string | null | undefined} [fulfillmentStatusOverride]
 */
export async function ensureSellerNewPaidOrderNotification(
  env,
  orderId,
  fulfillmentStatusOverride
) {
  try {
    const order = await fetchOrderById(env, orderId);
    const fulfillmentStatus =
      fulfillmentStatusOverride ?? order?.fulfillment_status;
    if (!shouldNotifySellerOnPaid(fulfillmentStatus)) {
      return;
    }
    if (!order?.seller_id) {
      console.warn(
        "[ensureSellerNewPaidOrderNotification] missing seller_id",
        orderId
      );
      return;
    }

    const item = await fetchFirstOrderItem(env, orderId);
    const productName = item?.product_id
      ? await fetchProductNameById(env, item.product_id)
      : "Product";
    const sizeLabel =
      item?.selected_variant_value?.trim() || item?.size?.trim() || null;

    let body = `Je hebt een betaalde bestelling voor ${productName}. Maak het pakket klaar voor verzending.`;
    if (sizeLabel) {
      body += ` Maat: ${sizeLabel}.`;
    }

    await supabaseRequest(
      env,
      "POST",
      "/seller_notifications",
      JSON.stringify({
        seller_id: order.seller_id,
        order_id: orderId,
        notification_type: "new_paid_order",
        title: "Nieuwe bestelling ontvangen",
        body,
        product_name: productName,
      }),
      { preferRepresentation: false, preferIgnoreDuplicates: true }
    );
    console.log("[ensureSellerNewPaidOrderNotification] ok", orderId);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (
      message.includes("409") &&
      message.includes("seller_notifications_order_dedup")
    ) {
      console.log(
        "[ensureSellerNewPaidOrderNotification] ok (already exists)",
        orderId
      );
      return;
    }
    console.warn(
      "[ensureSellerNewPaidOrderNotification] failed",
      orderId,
      message
    );
  }
}

async function notifyBuyerOrderRefunded(env, order, productName, refundRequiresReturn) {
  try {
    if (!order?.buyer_id || !order?.id) {
      return;
    }
    const copy = buildRefundNotificationCopy(refundRequiresReturn);
    await supabaseRequest(
      env,
      "POST",
      "/buyer_notifications",
      JSON.stringify({
        buyer_id: order.buyer_id,
        order_id: order.id,
        notification_type: "order_refunded",
        title: copy.buyerTitle,
        body: copy.buyerBody,
        product_name: productName,
      }),
      { preferRepresentation: false, preferIgnoreDuplicates: true }
    );
  } catch (e) {
    console.warn(
      "[notifyBuyerOrderRefunded]",
      order?.id,
      e instanceof Error ? e.message : String(e)
    );
  }
}

async function notifySellerOrderRefunded(env, order, productName, refundRequiresReturn) {
  try {
    if (!order?.seller_id || !order?.id) {
      return;
    }
    const copy = buildRefundNotificationCopy(refundRequiresReturn);
    await supabaseRequest(
      env,
      "POST",
      "/seller_notifications",
      JSON.stringify({
        seller_id: order.seller_id,
        order_id: order.id,
        notification_type: "order_refunded",
        title: copy.sellerTitle,
        body: copy.sellerBody,
        product_name: productName,
      }),
      { preferRepresentation: false, preferIgnoreDuplicates: true }
    );
  } catch (e) {
    console.warn(
      "[notifySellerOrderRefunded]",
      order?.id,
      e instanceof Error ? e.message : String(e)
    );
  }
}

async function resolveOrderIdFromPaymentIntent(env, paymentIntentId) {
  if (!paymentIntentId || typeof paymentIntentId !== "string") {
    return null;
  }
  const rows = await supabaseRequest(
    env,
    "GET",
    `/orders?stripe_payment_intent_id=eq.${encodeURIComponent(paymentIntentId)}&select=id&limit=1`
  );
  if (Array.isArray(rows) && rows[0]?.id) {
    return rows[0].id;
  }
  try {
    const pi = await stripeRequest(
      env,
      "GET",
      `/payment_intents/${encodeURIComponent(paymentIntentId)}`
    );
    const metaId = pi?.metadata?.order_id;
    if (isStandardUuid(metaId)) {
      return metaId;
    }
  } catch (e) {
    console.warn(
      "[resolveOrderIdFromPaymentIntent]",
      paymentIntentId,
      e instanceof Error ? e.message : String(e)
    );
  }
  return null;
}

async function handleChargeRefunded(env, event) {
  const logPrefix = "[chargeRefunded]";
  const chargeFromEvent = event?.data?.object;
  const chargeId = chargeFromEvent?.id;
  const paymentIntentRaw = chargeFromEvent?.payment_intent;
  const paymentIntentId =
    typeof paymentIntentRaw === "string"
      ? paymentIntentRaw
      : paymentIntentRaw?.id ?? null;

  if (!chargeId) {
    console.warn(logPrefix, "missing charge id");
    return { handled: false, reason: "missing_charge_id" };
  }

  let verifiedCharge;
  try {
    verifiedCharge = await stripeRequest(
      env,
      "GET",
      `/charges/${encodeURIComponent(chargeId)}`
    );
  } catch (e) {
    console.error(
      logPrefix,
      "stripe verify failed",
      chargeId,
      e instanceof Error ? e.message : String(e)
    );
    throw e;
  }

  if (!isFullChargeRefundSucceeded(verifiedCharge)) {
    console.log(logPrefix, "skip — not a succeeded full refund", {
      chargeId,
      refunded: verifiedCharge?.refunded ?? null,
      amountRefunded: verifiedCharge?.amount_refunded ?? null,
      amount: verifiedCharge?.amount ?? null,
    });
    return { handled: false, reason: "not_full_refund_succeeded" };
  }

  const piForLookup =
    typeof verifiedCharge.payment_intent === "string"
      ? verifiedCharge.payment_intent
      : verifiedCharge.payment_intent?.id ?? paymentIntentId;

  const orderId = await resolveOrderIdFromPaymentIntent(env, piForLookup);
  if (!isStandardUuid(orderId)) {
    console.warn(logPrefix, "order not found for payment intent", piForLookup);
    return { handled: false, reason: "order_not_found" };
  }

  const amountRefundedCents = Number(verifiedCharge.amount_refunded ?? 0);
  const rpcResult = await applyFullOrderRefundRpc(
    env,
    orderId,
    event.id,
    amountRefundedCents,
    chargeId
  );

  console.log(logPrefix, "rpc result", {
    orderId,
    eventId: event.id,
    duplicate: rpcResult?.duplicate ?? null,
    applied: rpcResult?.applied ?? null,
    refundRequiresReturn: rpcResult?.refund_requires_return ?? null,
    stockRestored: rpcResult?.stock_restored ?? null,
  });

  if (!shouldSendRefundNotifications(rpcResult)) {
    if (rpcResult?.applied === true) {
      try {
        await patchOrderFields(env, orderId, {
          fulfillment_status: "refunded",
          refund_completed_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn(
          logPrefix,
          "fulfillment patch after refund failed",
          orderId,
          e instanceof Error ? e.message : String(e)
        );
      }
    }
    return {
      handled: true,
      orderId,
      duplicate: rpcResult?.duplicate === true,
      applied: rpcResult?.applied === true,
    };
  }

  try {
    await patchOrderFields(env, orderId, {
      fulfillment_status: "refunded",
      refund_completed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn(
      logPrefix,
      "fulfillment patch after refund failed",
      orderId,
      e instanceof Error ? e.message : String(e)
    );
  }

  const order = await fetchOrderById(env, orderId);
  const item = await fetchFirstOrderItem(env, orderId);
  const productName = item?.product_id
    ? await fetchProductNameById(env, item.product_id)
    : "Product";
  const refundRequiresReturn = rpcResult?.refund_requires_return === true;

  await notifyBuyerOrderRefunded(env, order, productName, refundRequiresReturn);
  await notifySellerOrderRefunded(env, order, productName, refundRequiresReturn);

  return {
    handled: true,
    orderId,
    applied: true,
    refundRequiresReturn,
    stockRestored: rpcResult?.stock_restored === true,
  };
}

async function releaseStockForExpiredCheckout(env, orderId) {
  await releaseProductStockForOrder(env, orderId);
  console.log("[checkout] stock released after session expired", orderId);
}

async function expireStripeCheckoutSessionIfOpen(env, sessionId) {
  if (!sessionId || !String(sessionId).startsWith("cs_")) {
    return;
  }
  try {
    const session = await stripeRequest(
      env,
      "GET",
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      null
    );
    if (session.status === "open") {
      await stripeRequest(
        env,
        "POST",
        `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,
        null
      );
      console.log("[checkout] expired open Stripe session", sessionId);
    }
  } catch (e) {
    console.warn(
      "[checkout] could not expire Stripe session",
      sessionId,
      e instanceof Error ? e.message : String(e)
    );
  }
}

/** Geef gereserveerde voorraad terug wanneer checkout definitief is mislukt/verlopen. */
async function safeReleaseCheckoutStock(env, orderId) {
  const order = await fetchOrderById(env, orderId);
  if (!order) {
    return { ok: false, released: false, reason: "not_found" };
  }
  if (order.payment_status === "paid") {
    return { ok: true, released: false, reason: "already_paid" };
  }

  const sessionId = String(order.stripe_checkout_session_id || "").trim();
  if (sessionId.startsWith("cs_")) {
    try {
      const session = await stripeRequest(
        env,
        "GET",
        `/checkout/sessions/${encodeURIComponent(sessionId)}`,
        null
      );
      if (checkoutSessionIsPaid(session)) {
        return { ok: true, released: false, reason: "payment_pending" };
      }
      if (session.status === "open") {
        await expireStripeCheckoutSessionIfOpen(env, sessionId);
        return { ok: true, released: false, reason: "session_expiring" };
      }
      if (
        session.status === "expired" ||
        (session.status === "complete" && session.payment_status === "unpaid")
      ) {
        const released = await releaseProductStockForOrder(env, orderId);
        console.log("[checkout] safe stock release", { orderId, released });
        return { ok: true, released: released !== false, reason: "released" };
      }
      return { ok: true, released: false, reason: "session_active" };
    } catch (e) {
      console.warn(
        "[checkout] safe release session lookup failed",
        orderId,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  if (
    order.stock_reserved_at &&
    !order.stock_released_at &&
    !order.stock_committed_at
  ) {
    const released = await releaseProductStockForOrder(env, orderId);
    return { ok: true, released: released !== false, reason: "released_no_session" };
  }
  return { ok: true, released: false, reason: "nothing_to_release" };
}

/** @deprecated Prefer safeReleaseCheckoutStock — behouden voor interne compat. */
async function abandonCheckoutAndReleaseStock(env, orderId) {
  return safeReleaseCheckoutStock(env, orderId);
}

function webhookSecretBytes(secret) {
  // Stripe signs with the endpoint secret string exactly as shown in Dashboard
  // (including the whsec_ prefix); it is not base64-decoded first.
  return new TextEncoder().encode(secret);
}

function hexFromBuffer(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeWebhook(payload, sigHeader, secret) {
  if (!sigHeader || !secret) {
    throw new Error("Missing webhook signature or secret");
  }
  const parts = {};
  for (const item of sigHeader.split(",")) {
    const [k, v] = item.split("=");
    if (k && v) {
      parts[k.trim()] = v.trim();
    }
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) {
    throw new Error("Invalid Stripe-Signature header");
  }
  const signedPayload = `${t}.${payload}`;
  const keyBytes = webhookSecretBytes(secret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signedPayload)
  );
  const expected = hexFromBuffer(sig);
  if (expected !== v1) {
    throw new Error("Webhook signature mismatch");
  }
}

function checkoutSessionIsPaid(session) {
  if (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  ) {
    return true;
  }
  // checkout.session.completed: card/iDEAL-test — status complete + niet unpaid
  if (session.status === "complete" && session.mode === "payment") {
    return session.payment_status !== "unpaid";
  }
  return false;
}

async function resolveOrderIdFromSession(env, session) {
  const metaId = session.metadata?.order_id;
  if (isStandardUuid(metaId)) {
    return metaId;
  }
  if (session.id) {
    const rows = await supabaseRequest(
      env,
      "GET",
      `/orders?stripe_checkout_session_id=eq.${encodeURIComponent(session.id)}&select=id&limit=1`
    );
    if (Array.isArray(rows) && rows[0]?.id) {
      return rows[0].id;
    }
  }
  return null;
}

async function syncOrderFromStripeSession(env, session, { allowMarkPaid = false } = {}) {
  const orderId = await resolveOrderIdFromSession(env, session);
  if (!isStandardUuid(orderId)) {
    throw new Error("Session missing order_id metadata");
  }
  if (allowMarkPaid && checkoutSessionIsPaid(session)) {
    await markOrderPaid(
      env,
      orderId,
      session.id,
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id
    );
    console.log("[stripe sync] order marked paid (webhook)", orderId, session.id);
    return { orderId, paid: true, paymentStatus: "paid", status: "paid" };
  }
  if (
    allowMarkPaid &&
    session.payment_status === "unpaid" &&
    session.status === "expired"
  ) {
    await releaseStockForExpiredCheckout(env, orderId);
    return {
      orderId,
      paid: false,
      paymentStatus: "unpaid",
      status: "pending_payment",
    };
  }
  const order = await fetchOrderById(env, orderId);
  const stripePaidPending =
    !allowMarkPaid && checkoutSessionIsPaid(session) && order?.payment_status !== "paid";
  return {
    orderId,
    paid: order?.payment_status === "paid",
    paymentStatus: order?.payment_status || "unpaid",
    status: order?.status || "pending_payment",
    stripePaidPending: stripePaidPending || undefined,
  };
}

/**
 * POST ?stripeCheckout=1  body: { orderId }
 */
export async function handleStripeCheckout(request, env, cors = {}) {
  const logPrefix = "[stripeCheckout]";
  try {
    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;

    const hasStripeKey =
      typeof env.STRIPE_SECRET_KEY === "string" &&
      env.STRIPE_SECRET_KEY.startsWith("sk_");
    console.log(logPrefix, "STRIPE_SECRET_KEY configured:", hasStripeKey);

    if (!hasStripeKey) {
      return jsonStripe(
        {
          error: "Payment service unavailable",
          step: "config",
        },
        500,
        cors
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.error(logPrefix, "invalid JSON body", parseErr);
      return jsonStripe(
        {
          error: `Invalid JSON body: ${(parseErr && parseErr.message) || String(parseErr)}`,
          step: "parse_body",
        },
        400,
        cors
      );
    }

    const orderId = String(body?.orderId || "").trim();
    console.log(logPrefix, "orderId", orderId, "buyer", userId);

    if (!isStandardUuid(orderId)) {
      return jsonStripe({ error: "Invalid orderId", step: "validate" }, 400, cors);
    }

    const order = await fetchOrderById(env, orderId);
    if (!order) {
      return jsonStripe({ error: "Order not found" }, 404, cors);
    }
    if (order.buyer_id !== userId) {
      return jsonStripe({ error: "Forbidden" }, 403, cors);
    }
    if (order.payment_status === "paid") {
      return jsonStripe({ error: "Order already paid" }, 400, cors);
    }

    if (order.payment_status === "paid") {
      return jsonStripe({ error: "Order already paid" }, 400, cors);
    }

    const existingSessionId = String(order.stripe_checkout_session_id || "").trim();
    if (existingSessionId.startsWith("cs_") && order.payment_status === "unpaid") {
      try {
        const existing = await stripeRequest(
          env,
          "GET",
          `/checkout/sessions/${encodeURIComponent(existingSessionId)}`,
          null
        );
        if (existing.status === "open" && existing.url) {
          const reservationActive =
            order.stock_reserved_at &&
            !order.stock_released_at &&
            !order.stock_committed_at;
          if (reservationActive) {
            console.log(logPrefix, "reusing open checkout session", existingSessionId);
            return jsonStripe(
              {
                checkoutUrl: existing.url,
                sessionId: existing.id,
                orderId,
                reused: true,
              },
              200,
              cors
            );
          }
          console.log(
            logPrefix,
            "open session without active reservation — expiring",
            existingSessionId
          );
          await expireStripeCheckoutSessionIfOpen(env, existingSessionId);
        }
        if (existing.status === "expired") {
          console.log(logPrefix, "existing session expired, releasing stock", existingSessionId);
          await releaseStockForExpiredCheckout(env, orderId);
        }
        if (checkoutSessionIsPaid(existing)) {
          const orderNow = await fetchOrderById(env, orderId);
          if (orderNow?.payment_status === "paid") {
            return jsonStripe({ error: "Order already paid" }, 400, cors);
          }
          console.log(
            logPrefix,
            "Stripe session paid but order unpaid — waiting for webhook",
            existingSessionId
          );
          return jsonStripe(
            {
              error: "Payment is being processed",
              step: "payment_pending",
              message: "Je betaling wordt verwerkt. Even geduld.",
            },
            409,
            cors
          );
        }
      } catch (reuseErr) {
        console.warn(logPrefix, "could not reuse session", (reuseErr && reuseErr.message) || String(reuseErr));
      }
    }

    const first = await fetchFirstOrderItem(env, orderId);
    const validation = await validateAndSyncOrderForCheckout(env, order, first);
    if (!validation.ok) {
      return jsonStripe(
        {
          error: validation.error,
          step: validation.step,
          message: validation.error,
        },
        400,
        cors
      );
    }

    const productName = validation.productName;
    const subtotalCents = validation.subtotalCents;
    const feeCents = validation.feeCents;

    const sellerProfile = await fetchSellerProfileForCheckout(env, order.seller_id);
    if (!isSellerReadyForDestinationCharge(env, sellerProfile)) {
      console.log(logPrefix, "seller not ready for destination charge", {
        sellerId: order.seller_id,
        status: sellerProfile?.seller_onboarding_status,
        charges: sellerProfile?.stripe_charges_enabled,
        payouts: sellerProfile?.stripe_payouts_enabled,
        account: sellerProfile?.stripe_connect_account_id
          ? "present"
          : "missing",
      });
      return jsonStripe(
        {
          error: "Seller payouts are not ready",
          step: "seller_connect_not_ready",
          message:
            "Deze verkoper kan momenteel nog geen betalingen ontvangen.",
        },
        400,
        cors
      );
    }

    const destinationAccountId = String(
      sellerProfile.stripe_connect_account_id
    ).trim();

    const urls = checkoutReturnUrls(env, {
      successUrl:
        typeof body?.successUrl === "string" ? body.successUrl.trim() : undefined,
      cancelUrl:
        typeof body?.cancelUrl === "string" ? body.cancelUrl.trim() : undefined,
    });
    console.log(logPrefix, "return URLs", {
      success: urls.success.slice(0, 120),
      cancel: urls.cancel.slice(0, 120),
    });
    const checkoutExpiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_EXPIRES_SECONDS;
    const params = {
      mode: "payment",
      expires_at: String(checkoutExpiresAt),
      success_url: urls.success,
      cancel_url: `${urls.cancel}${urls.cancel.includes("?") ? "&" : "?"}order_id=${encodeURIComponent(orderId)}`,
      customer_email: order.buyer_email || undefined,
      "metadata[order_id]": orderId,
      "metadata[buyer_id]": userId,
      "metadata[seller_id]": order.seller_id,
      "metadata[platform_fee_rate]": String(PLATFORM_FEE_RATE),
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(subtotalCents),
      "line_items[0][price_data][product_data][name]": productName.slice(0, 120),
      "payment_intent_data[application_fee_amount]": String(feeCents),
      "payment_intent_data[transfer_data][destination]": destinationAccountId,
      "payment_intent_data[metadata][order_id]": orderId,
    };
    if (validation.productId && isStandardUuid(validation.productId)) {
      params["metadata[product_id]"] = validation.productId;
    } else if (first?.product_id && isStandardUuid(first.product_id)) {
      params["metadata[product_id]"] = first.product_id;
    }

    console.log(logPrefix, "creating Stripe session (destination charge)", {
      orderId,
      subtotalCents,
      feeCents,
      destinationAccountId,
      productName: productName.slice(0, 40),
      expiresAt: checkoutExpiresAt,
    });

    const reserved = await reserveProductStockForOrder(env, orderId);
    if (!reserved) {
      return jsonStripe(
        {
          error: "Dit product is niet op voorraad.",
          step: "out_of_stock",
          message: "Dit product is niet op voorraad.",
        },
        400,
        cors
      );
    }

    let session;
    try {
      session = await stripeRequest(env, "POST", "/checkout/sessions", params);
    } catch (sessionErr) {
      await releaseProductStockForOrder(env, orderId);
      throw sessionErr;
    }

    console.log(logPrefix, "Stripe session", {
      id: session.id,
      hasUrl: !!session.url,
      status: session.status,
      paymentStatus: session.payment_status,
    });

    if (!session.id || !session.url) {
      await releaseProductStockForOrder(env, orderId);
      return jsonStripe(
        {
          error: "Stripe Checkout Session heeft geen url (controleer Stripe-dashboard / account)",
          step: "stripe_session",
          sessionId: session.id || null,
          stripeStatus: session.status || null,
        },
        502,
        cors
      );
    }

    await supabaseRequest(
      env,
      "PATCH",
      `/orders?id=eq.${encodeURIComponent(orderId)}`,
      JSON.stringify({ stripe_checkout_session_id: session.id }),
      { preferRepresentation: false }
    );

    return jsonStripe(
      {
        checkoutUrl: session.url,
        sessionId: session.id,
        orderId,
      },
      200,
      cors
    );
  } catch (e) {
    const message = (e && e.message) || String(e);
    console.error(logPrefix, "failed", message);
    return jsonStripe({ error: message, step: "stripe_checkout" }, 500, cors);
  }
}

/**
 * POST ?stripeWebhook=1  (raw Stripe event)
 */
export async function handleStripeWebhook(request, env) {
  const logPrefix = "[stripeWebhook]";
  try {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret || typeof secret !== "string") {
      console.error(logPrefix, "Missing STRIPE_WEBHOOK_SECRET");
      return new Response(
        JSON.stringify({
          error:
            "Missing STRIPE_WEBHOOK_SECRET. Run: npx wrangler secret put STRIPE_WEBHOOK_SECRET",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = await request.text();
    const sig = request.headers.get("Stripe-Signature") || "";
    await verifyStripeWebhook(payload, sig, secret);
    const event = JSON.parse(payload);

    console.log(logPrefix, "event", event.id, event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log(logPrefix, "session", {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        order_id: session.metadata?.order_id,
      });
      const result = await syncOrderFromStripeSession(env, session, {
        allowMarkPaid: true,
      });
      console.log(logPrefix, "sync result", result);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      const result = await syncOrderFromStripeSession(env, session, {
        allowMarkPaid: true,
      });
      console.log(logPrefix, "async payment sync", result);
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const orderId = await resolveOrderIdFromSession(env, session);
      if (isStandardUuid(orderId)) {
        await releaseStockForExpiredCheckout(env, orderId);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      console.log(logPrefix, "payment_intent.payment_failed (no stock release)", {
        paymentIntentId: pi?.id ?? null,
        orderId: pi?.metadata?.order_id ?? null,
      });
    } else if (event.type === "account.updated") {
      const account = event.data.object;
      const result = await handleStripeAccountUpdated(env, account);
      console.log(logPrefix, "account.updated", {
        accountId: account?.id,
        handled: result.handled,
        payoutReady: result.payoutReady,
      });
    } else if (event.type === "charge.refunded") {
      const result = await handleChargeRefunded(env, event);
      console.log(logPrefix, "charge.refunded", result);
    } else if (event.type === "refund.updated") {
      const refund = event.data.object;
      if (isRefundUpdatedFailed(refund)) {
        console.log(logPrefix, "refund.updated failed (manual review)", {
          refundId: refund?.id ?? null,
          chargeId: refund?.charge ?? null,
          paymentIntent: refund?.payment_intent ?? null,
        });
        const piForLookup =
          typeof refund?.payment_intent === "string"
            ? refund.payment_intent
            : refund?.payment_intent?.id ?? null;
        const orderId = await resolveOrderIdFromPaymentIntent(
          env,
          piForLookup
        );
        if (isStandardUuid(orderId)) {
          try {
            await patchOrderFields(env, orderId, {
              fulfillment_status: "manual_review",
              fulfillment_exception_at: new Date().toISOString(),
            });
          } catch (e) {
            console.warn(
              logPrefix,
              "manual_review patch failed",
              orderId,
              e instanceof Error ? e.message : String(e)
            );
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true, type: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = (e && e.message) || String(e);
    console.error(logPrefix, "failed", message);
    const status = isRetriableRefundApplyError(message) ? 500 : 400;
    return new Response(JSON.stringify({ error: message, retriable: status === 500 }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GET ?checkoutReturn=1&session_id=cs_...
 * HTTPS landing page after Stripe Checkout (works in Expo Go / Safari).
 */
export async function handleCheckoutReturn(request, url, env, cors = {}) {
  const logPrefix = "[checkoutReturn]";
  const sessionId = (url.searchParams.get("session_id") || "").trim();
  let paid = false;

  if (sessionId.startsWith("cs_")) {
    try {
      const session = await stripeRequest(
        env,
        "GET",
        `/checkout/sessions/${encodeURIComponent(sessionId)}`,
        null
      );
      const result = await syncOrderFromStripeSession(env, session, {
        allowMarkPaid: false,
      });
      paid = !!result.paid;
      console.log(logPrefix, "read-only sync", { sessionId, paid, result });
    } catch (e) {
      console.error(logPrefix, "sync failed", (e && e.message) || String(e));
    }
  } else {
    console.warn(logPrefix, "missing session_id");
  }

  const appDeepLink = (
    env.CHECKOUT_SUCCESS_URL ||
    "lumen-fashion://checkout/success?session_id={CHECKOUT_SESSION_ID}"
  ).replace("{CHECKOUT_SESSION_ID}", encodeURIComponent(sessionId));

  const title = paid ? "Betaling gelukt" : "Betaling wordt verwerkt";
  const message = paid
    ? "Je betaling is ontvangen. Sluit dit venster en ga terug naar de app."
    : "Je betaling wordt nog verwerkt. Sluit dit venster en ga terug naar de app.";

  return htmlPage(
    title,
    `<h1>${title}</h1><p>${message}</p><p><a href="${appDeepLink}">Terug naar de app</a></p>`,
    cors
  );
}

/**
 * GET ?checkoutCancel=1&order_id=...
 */
export async function handleCheckoutCancel(request, url, env, cors = {}) {
  const orderId = (url.searchParams.get("order_id") || "").trim();
  console.log("[checkoutCancel]", { orderId });
  if (isStandardUuid(orderId)) {
    const order = await fetchOrderById(env, orderId);
    const sessionId = String(order?.stripe_checkout_session_id || "").trim();
    if (sessionId.startsWith("cs_")) {
      await expireStripeCheckoutSessionIfOpen(env, sessionId);
      console.log("[checkoutCancel] expired open session — stock via webhook", {
        orderId,
        sessionId,
      });
    }
  }
  const appDeepLink = (
    env.CHECKOUT_CANCEL_URL || "lumen-fashion://checkout/cancel"
  ) + (orderId ? `?order_id=${encodeURIComponent(orderId)}` : "");

  return htmlPage(
    "Betaling geannuleerd",
    `<h1>Betaling geannuleerd</h1><p>Je kunt dit venster sluiten en teruggaan naar de app.</p><p><a href="${appDeepLink}">Terug naar de app</a></p>`,
    cors
  );
}

/**
 * POST ?checkoutReleaseStock=1  body: { orderId }
 * Buyer-only: geef checkout-reservering vrij na annuleren / wegklikken.
 */
export async function handleCheckoutReleaseStock(request, env, cors = {}) {
  const logPrefix = "[checkoutReleaseStock]";
  try {
    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonStripe({ error: "Invalid JSON body", step: "parse_body" }, 400, cors);
    }

    const orderId = String(body?.orderId || "").trim();
    if (!isStandardUuid(orderId)) {
      return jsonStripe({ error: "Invalid orderId", step: "validate" }, 400, cors);
    }

    const order = await fetchOrderById(env, orderId);
    if (!order) {
      return jsonStripe({ error: "Order not found" }, 404, cors);
    }
    if (order.buyer_id !== userId) {
      return jsonStripe({ error: "Forbidden" }, 403, cors);
    }

    const result = await safeReleaseCheckoutStock(env, orderId);
    return jsonStripe(
      {
        orderId,
        released: result.released,
        reason: result.reason,
      },
      200,
      cors
    );
  } catch (e) {
    const message = (e && e.message) || String(e);
    console.error(logPrefix, "failed", message);
    return jsonStripe({ error: message, step: "checkout_release" }, 500, cors);
  }
}

/**
 * GET ?stripeConfirm=1&session_id=cs_...
 */
export async function handleStripeConfirm(request, url, env, cors = {}) {
  try {
    const auth = await requireAuthUser(request, env, cors);
    if (auth.error) {
      return auth.error;
    }
    const userId = auth.userId;
    const sessionId = url.searchParams.get("session_id") || "";
    if (!sessionId.startsWith("cs_")) {
      return jsonStripe({ error: "Invalid session_id" }, 400, cors);
    }

    const session = await stripeRequest(
      env,
      "GET",
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      null
    );

    if (session.metadata?.buyer_id !== userId) {
      return jsonStripe({ error: "Not your checkout session" }, 403, cors);
    }

    const result = await syncOrderFromStripeSession(env, session, {
      allowMarkPaid: false,
    });
    return jsonStripe(result, 200, cors);
  } catch (e) {
    return jsonStripe({ error: (e && e.message) || String(e) }, 500, cors);
  }
}
