/**
 * Reproduce seller ship update on staging v2 (read + optional ship test).
 * Usage: node scripts/staging-ship-update-diagnose.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const STAGING_REF = "xwezgyelwovczuqyyqwu";

function parseSecrets() {
  return Object.fromEntries(
    readFileSync(".staging-v2.secrets.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function parsePasswords() {
  return Object.fromEntries(
    readFileSync(".staging-v2-passwords.local", "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const secrets = parseSecrets();
const passwords = parsePasswords();
const seed = JSON.parse(readFileSync(".staging-v2-seed.json", "utf8"));
const url = secrets.SUPABASE_URL;

const sellerClient = createClient(url, secrets.SUPABASE_ANON_KEY);
const { error: loginErr } = await sellerClient.auth.signInWithPassword({
  email: passwords.seller_email,
  password: passwords.seller_password,
});
if (loginErr) {
  console.error("seller login failed:", loginErr.message);
  process.exit(1);
}

const sellerId = seed.seller.id;
const { data: orders, error: listErr } = await sellerClient
  .from("orders")
  .select("id, payment_status, shipping_status, status")
  .eq("seller_id", sellerId)
  .eq("payment_status", "paid")
  .order("created_at", { ascending: false })
  .limit(5);

if (listErr) {
  console.error("list orders failed:", listErr.message, listErr);
  process.exit(1);
}

console.log("paid orders for seller:", orders);

const target =
  orders?.find((o) => o.shipping_status === "not_shipped") ?? orders?.[0];
if (!target) {
  console.log("no paid order to test");
  process.exit(0);
}

console.log("testing ship update on order:", target.id);

const patch = {
  status: "shipped",
  shipping_status: "shipped",
  shipped_at: new Date().toISOString(),
};

const { data, error } = await sellerClient
  .from("orders")
  .update(patch)
  .eq("id", target.id)
  .eq("seller_id", sellerId)
  .select("id, shipping_status, shipped_at")
  .single();

if (error) {
  console.error("SHIP UPDATE FAILED:", {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  process.exit(1);
}

console.log("SHIP UPDATE OK:", data);
