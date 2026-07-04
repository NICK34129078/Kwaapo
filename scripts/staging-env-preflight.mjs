/**
 * Validates process env for staging checkout (no secret values printed).
 */

const STAGING_SUPABASE_REF = "xwezgyelwovczuqyyqwu";
const PROD_SUPABASE_REF = "mvngamvkdtcprgiizcvk";
const STAGING_WORKER_HOST = "kwaapo-staging-checkout.n-vandullemen.workers.dev";
const PROD_WORKER_HOST = "wild-mountain-072a";

function fail(message) {
  console.error(`[preflight] FAIL: ${message}`);
  process.exit(1);
}

const staging = process.env.EXPO_PUBLIC_STAGING?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? "";
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const workerBase = process.env.EXPO_PUBLIC_KWAAPO_WORKER_BASE?.trim() ?? "";

if (staging !== "1") fail("EXPO_PUBLIC_STAGING must be 1");
if (!supabaseUrl.includes(STAGING_SUPABASE_REF)) {
  fail(`Supabase URL must target staging v2 (${STAGING_SUPABASE_REF})`);
}
if (supabaseUrl.includes(PROD_SUPABASE_REF)) {
  fail("Supabase URL must not target production");
}
if (!anonKey || anonKey === "your-staging-anon-key") {
  fail("EXPO_PUBLIC_SUPABASE_ANON_KEY is missing or placeholder");
}
if (!workerBase.includes(STAGING_WORKER_HOST)) {
  fail(`Worker base must be staging (${STAGING_WORKER_HOST})`);
}
if (workerBase.includes(PROD_WORKER_HOST)) {
  fail("Worker base must not target production");
}

console.log("[preflight] OK: staging env targets v2 Supabase + staging Worker");
console.log(
  "[preflight] Expected Metro log on checkout: [Stripe] POST https://kwaapo-staging-checkout..."
);
const fee = Math.round(19.99 * 0.125 * 100) / 100;
const seller = Math.round((19.99 - fee) * 100) / 100;
console.log(
  `[preflight] Expected fees for Staging Simple Tee: platform ${fee.toFixed(2)}, seller ${seller.toFixed(2)}`
);
