/**
 * Stripe Checkout (test mode) — server-side only.
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
    `/order_items?order_id=eq.${encodeURIComponent(orderId)}&select=product_id,quantity,unit_price&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0];
}

const PLATFORM_FEE_RATE = 0.125;

const SELLER_CHECKOUT_COLUMNS =
  "id,seller_onboarding_status,stripe_connect_account_id,stripe_charges_enabled,stripe_payouts_enabled";

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

function isSellerReadyForDestinationCharge(profile) {
  if (!profile) {
    return false;
  }
  const accountId = String(profile.stripe_connect_account_id || "").trim();
  return (
    profile.seller_onboarding_status === "verified" &&
    accountId.startsWith("acct_") &&
    profile.stripe_charges_enabled === true &&
    profile.stripe_payouts_enabled === true
  );
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

async function stripeRequest(env, method, path, params) {
  assertStripeSecret(env);
  const key = env.STRIPE_SECRET_KEY;
  const headers = {
    Authorization: `Bearer ${key}`,
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

async function markOrderPaid(env, orderId, sessionId, paymentIntentId) {
  const patch = {
    status: "paid",
    payment_status: "paid",
    paid_at: new Date().toISOString(),
  };
  if (sessionId) {
    patch.stripe_checkout_session_id = sessionId;
  }
  if (paymentIntentId) {
    patch.stripe_payment_intent_id = paymentIntentId;
  }
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
  console.log("[markOrderPaid] ok", orderId);
}

async function markOrderPaymentFailed(env, orderId) {
  await supabaseRequest(
    env,
    "PATCH",
    `/orders?id=eq.${encodeURIComponent(orderId)}`,
    JSON.stringify({ payment_status: "failed" }),
    { preferRepresentation: false }
  );
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

async function syncOrderFromStripeSession(env, session) {
  const orderId = await resolveOrderIdFromSession(env, session);
  if (!isStandardUuid(orderId)) {
    throw new Error("Session missing order_id metadata");
  }
  if (checkoutSessionIsPaid(session)) {
    await markOrderPaid(
      env,
      orderId,
      session.id,
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id
    );
    console.log("[stripe sync] order marked paid", orderId, session.id);
    return { orderId, paid: true, paymentStatus: "paid", status: "paid" };
  }
  if (
    session.payment_status === "unpaid" &&
    session.status === "expired"
  ) {
    await markOrderPaymentFailed(env, orderId);
    return { orderId, paid: false, paymentStatus: "failed", status: "pending_payment" };
  }
  const order = await fetchOrderById(env, orderId);
  return {
    orderId,
    paid: order?.payment_status === "paid",
    paymentStatus: order?.payment_status || "unpaid",
    status: order?.status || "pending_payment",
  };
}

/**
 * POST ?stripeCheckout=1  body: { orderId }
 */
export async function handleStripeCheckout(request, env, cors = {}) {
  const logPrefix = "[stripeCheckout]";
  try {
    const hasStripeKey =
      typeof env.STRIPE_SECRET_KEY === "string" &&
      env.STRIPE_SECRET_KEY.startsWith("sk_");
    console.log(logPrefix, "STRIPE_SECRET_KEY configured:", hasStripeKey);

    const userId = (request.headers.get("X-App-User-Id") || "").trim();
    if (!isStandardUuid(userId)) {
      return jsonStripe(
        { error: "X-App-User-Id required", step: "auth" },
        400,
        cors
      );
    }

    if (!hasStripeKey) {
      return jsonStripe(
        {
          error:
            "Missing STRIPE_SECRET_KEY in Worker secrets. Run: npx wrangler secret put STRIPE_SECRET_KEY",
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
      return jsonStripe({ error: "Not your order" }, 403, cors);
    }
    if (order.payment_status === "paid") {
      return jsonStripe({ error: "Order already paid" }, 400, cors);
    }

    const first = await fetchFirstOrderItem(env, orderId);
    const productName = first?.product_id
      ? await fetchProductName(env, first.product_id)
      : "Bestelling";
    const subtotalCents = amountToCents(order.subtotal_amount);
    if (subtotalCents < 50) {
      return jsonStripe({ error: "Order amount too low for Stripe" }, 400, cors);
    }

    const sellerProfile = await fetchSellerProfileForCheckout(env, order.seller_id);
    if (!isSellerReadyForDestinationCharge(sellerProfile)) {
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
            "Deze verkoper kan nog geen betalingen ontvangen. Stripe-uitbetalingen moeten eerst actief zijn.",
        },
        400,
        cors
      );
    }

    const destinationAccountId = String(
      sellerProfile.stripe_connect_account_id
    ).trim();
    const feeCents = applicationFeeCents(subtotalCents);

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
    const params = {
      mode: "payment",
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
    };
    if (first?.product_id && isStandardUuid(first.product_id)) {
      params["metadata[product_id]"] = first.product_id;
    }

    console.log(logPrefix, "creating Stripe session (destination charge)", {
      orderId,
      subtotalCents,
      feeCents,
      destinationAccountId,
      productName: productName.slice(0, 40),
    });

    const session = await stripeRequest(env, "POST", "/checkout/sessions", params);

    console.log(logPrefix, "Stripe session", {
      id: session.id,
      hasUrl: !!session.url,
      status: session.status,
      paymentStatus: session.payment_status,
    });

    if (!session.id || !session.url) {
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
      const result = await syncOrderFromStripeSession(env, session);
      console.log(logPrefix, "sync result", result);
    } else if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      const result = await syncOrderFromStripeSession(env, session);
      console.log(logPrefix, "async payment sync", result);
    } else if (event.type === "checkout.session.expired") {
      const session = event.data.object;
      const orderId = await resolveOrderIdFromSession(env, session);
      if (isStandardUuid(orderId)) {
        await markOrderPaymentFailed(env, orderId);
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (isStandardUuid(orderId)) {
        await markOrderPaymentFailed(env, orderId);
      }
    }

    return new Response(JSON.stringify({ received: true, type: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = (e && e.message) || String(e);
    console.error(logPrefix, "failed", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
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
      const result = await syncOrderFromStripeSession(env, session);
      paid = !!result.paid;
      console.log(logPrefix, "sync", { sessionId, paid, result });
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
 * GET ?stripeConfirm=1&session_id=cs_...
 */
export async function handleStripeConfirm(request, url, env, cors = {}) {
  try {
    const userId = (request.headers.get("X-App-User-Id") || "").trim();
    const sessionId = url.searchParams.get("session_id") || "";
    if (!isStandardUuid(userId)) {
      return jsonStripe({ error: "X-App-User-Id required" }, 400, cors);
    }
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

    const result = await syncOrderFromStripeSession(env, session);
    return jsonStripe(result, 200, cors);
  } catch (e) {
    return jsonStripe({ error: (e && e.message) || String(e) }, 500, cors);
  }
}
