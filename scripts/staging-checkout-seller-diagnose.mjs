/**
 * Diagnose staging checkout seller readiness (REST only, no supabase db query).
 */
import { readFileSync, existsSync } from "node:fs";
import {
  isBusinessInfoComplete,
  isKvkVerificationSatisfied,
  isSellerReadyForCheckout,
  isStripePayoutReady,
} from "../worker-seller-readiness.js";

const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PRODUCT_ID = "e3a62590-f919-4718-a1e6-29af7e6e2fa0";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;

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

async function sbGet(path) {
  const secrets = parseFile(".staging-v2.secrets.local");
  const res = await fetch(`${STAGING_URL}/rest/v1${path}`, {
    headers: {
      apikey: secrets.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${secrets.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  return ok;
}

const seed = JSON.parse(readFileSync(".staging-v2-seed.json", "utf8"));
const envStaging = existsSync(".env.staging") ? parseFile(".env.staging") : {};

console.log("\n=== App env (.env.staging) ===");
check("EXPO_PUBLIC_STAGING=1", envStaging.EXPO_PUBLIC_STAGING === "1", envStaging.EXPO_PUBLIC_STAGING ?? "(unset)");
check("Supabase ref", (envStaging.EXPO_PUBLIC_SUPABASE_URL ?? "").includes(STAGING_REF));
check("Worker staging", (envStaging.EXPO_PUBLIC_KWAAPO_WORKER_BASE ?? "").includes("kwaapo-staging-checkout"));
check("Not prod Supabase", !(envStaging.EXPO_PUBLIC_SUPABASE_URL ?? "").includes("mvngamvkdtcprgiizcvk"));
check("Not prod worker", !(envStaging.EXPO_PUBLIC_KWAAPO_WORKER_BASE ?? "").includes("wild-mountain-072a"));

const [product] = await sbGet(
  `/products?id=eq.${PRODUCT_ID}&select=id,name,owner_id,is_active,stock,moderation_status`
);
const sellerId = product?.owner_id ?? seed.seller.id;
const [sellerProfile] = await sbGet(
  `/profiles?id=eq.${sellerId}&select=id,username,business_email,account_type,seller_type,seller_onboarding_status,stripe_connect_account_id,stripe_connect_onboarding_complete,stripe_charges_enabled,stripe_payouts_enabled,kvk_number,kvk_verified_at,business_name,business_country,business_city,business_postal_code,business_street,business_house_number`
);

console.log("\n=== Product ===");
console.log({
  product_id: product?.id,
  name: product?.name,
  seller_id: product?.owner_id,
  expected_seller_id: seed.seller.id,
  seller_matches_seed: product?.owner_id === seed.seller.id,
  is_active: product?.is_active,
  stock: product?.stock,
  moderation_status: product?.moderation_status,
});

console.log("\n=== Seller ===");
console.log({
  id: sellerProfile?.id,
  username: sellerProfile?.username,
  email: sellerProfile?.business_email,
  expected_username: seed.seller.username,
});

const mockEnv = { KVK_API_KEY: "staging-worker-has-kvk" };
const kvk = isKvkVerificationSatisfied(mockEnv, sellerProfile);
const businessOk = isBusinessInfoComplete(sellerProfile);
const stripeReady = isStripePayoutReady(sellerProfile, null);
const checkoutReady = isSellerReadyForCheckout(mockEnv, sellerProfile);

console.log("\n=== Field values ===");
console.log({
  stripe_connect_account_id: sellerProfile?.stripe_connect_account_id,
  stripe_connect_onboarding_complete: sellerProfile?.stripe_connect_onboarding_complete,
  stripe_charges_enabled: sellerProfile?.stripe_charges_enabled,
  stripe_payouts_enabled: sellerProfile?.stripe_payouts_enabled,
  seller_onboarding_status: sellerProfile?.seller_onboarding_status,
});

console.log("\n=== Guard checks (isSellerReadyForCheckout) ===");
const checks = [
  ["seller_onboarding_status === verified", sellerProfile?.seller_onboarding_status === "verified"],
  ["isBusinessInfoComplete", businessOk],
  ["kvk.satisfied", kvk.satisfied],
  ["stripe account acct_*", (sellerProfile?.stripe_connect_account_id ?? "").startsWith("acct_")],
  ["stripe_connect_onboarding_complete", sellerProfile?.stripe_connect_onboarding_complete === true],
  ["stripe_charges_enabled", sellerProfile?.stripe_charges_enabled === true],
  ["stripe_payouts_enabled", sellerProfile?.stripe_payouts_enabled === true],
  ["isStripePayoutReady", stripeReady],
  ["isSellerReadyForCheckout", checkoutReady],
];
for (const [name, ok] of checks) check(name, ok, !ok && name === "kvk.satisfied" ? kvk.reason : "");

const isVerifiedPayoutReady =
  sellerProfile?.seller_onboarding_status === "verified" && stripeReady && businessOk && kvk.satisfied;
check("is_verified_payout_ready_seller (derived)", isVerifiedPayoutReady);

const health = await fetch("https://kwaapo-staging-checkout.n-vandullemen.workers.dev?health=1");
console.log("\n=== Worker health ===", health.status, await health.text());
