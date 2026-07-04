/**
 * Simulate buyer stripeCheckout call on staging worker.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PRODUCT_ID = "e3a62590-f919-4718-a1e6-29af7e6e2fa0";
const WORKER = "https://kwaapo-staging-checkout.n-vandullemen.workers.dev";

function parseFile(path) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const secrets = parseFile(".staging-v2.secrets.local");
const passwords = parseFile(".staging-v2-passwords.local");
const url = secrets.SUPABASE_URL;

const buyer = createClient(url, secrets.SUPABASE_ANON_KEY);
const { error: loginErr } = await buyer.auth.signInWithPassword({
  email: passwords.buyer_email,
  password: passwords.buyer_password,
});
if (loginErr) throw loginErr;
const { data: sessionData } = await buyer.auth.getSession();
const token = sessionData.session?.access_token;
if (!token) throw new Error("no buyer session");

const admin = createClient(url, secrets.SUPABASE_SERVICE_ROLE_KEY);

const { data: orders } = await admin
  .from("orders")
  .select("id, seller_id, payment_status, buyer_id, created_at")
  .eq("payment_status", "unpaid")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("recent unpaid orders:", orders);

let orderId = orders?.find((o) => o.buyer_id === sessionData.session?.user.id)?.id;

if (!orderId) {
  const { data: product } = await admin
    .from("products")
    .select("id, owner_id, name, price, stock")
    .eq("id", PRODUCT_ID)
    .single();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      buyer_id: sessionData.session.user.id,
      seller_id: product.owner_id,
      status: "pending_payment",
      payment_status: "unpaid",
      subtotal_amount: product.price,
      platform_fee_amount: Math.round(Number(product.price) * 0.125 * 100) / 100,
      seller_amount:
        Math.round((Number(product.price) - Number(product.price) * 0.125) * 100) / 100,
      buyer_email: passwords.buyer_email,
      buyer_full_name: "Staging Buyer",
      shipping_country: "NL",
      shipping_city: "Amsterdam",
      shipping_postal_code: "1012AB",
      shipping_street: "Teststraat",
      shipping_house_number: "1",
      shipping_status: "not_shipped",
    })
    .select("id, seller_id")
    .single();
  if (orderErr) throw orderErr;
  const { error: itemErr } = await admin.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    quantity: 1,
    unit_price: product.price,
  });
  if (itemErr) throw itemErr;
  orderId = order.id;
  console.log("created test order:", order);
}

const res = await fetch(`${WORKER}?stripeCheckout=1`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    orderId,
    successUrl: `${WORKER}?checkoutReturn=1&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${WORKER}?checkoutCancel=1`,
  }),
});
const text = await res.text();
console.log("\nstripeCheckout response:", res.status, text.slice(0, 500));
