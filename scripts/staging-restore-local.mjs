/**
 * Restore local staging files + reset test account passwords (staging v2 only).
 * Usage: node scripts/staging-restore-local.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PROD_REF = "mvngamvkdtcprgiizcvk";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const STAGING_WORKER = "https://kwaapo-staging-checkout.n-vandullemen.workers.dev";

function fail(message) {
  console.error(`[staging-restore] FAIL: ${message}`);
  process.exit(1);
}

function fetchApiKeys() {
  const result = spawnSync(
    `npx supabase projects api-keys --project-ref ${STAGING_REF}`,
    { cwd: root, encoding: "utf8", shell: true }
  );
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "Could not fetch staging API keys");
  }
  const payload = JSON.parse(result.stdout);
  const anon = payload.keys?.find((k) => k.id === "anon")?.api_key;
  const serviceRole = payload.keys?.find((k) => k.id === "service_role")?.api_key;
  if (!anon || !serviceRole) fail("Missing anon or service_role key in CLI response");
  return { anon, serviceRole };
}

function makePassword() {
  return `${randomBytes(18).toString("base64url")}A1!`;
}

const seed = JSON.parse(readFileSync(join(root, ".staging-v2-seed.json"), "utf8"));
if (!seed.supabaseUrl?.includes(STAGING_REF) || seed.supabaseUrl?.includes(PROD_REF)) {
  fail("Seed file does not target staging v2");
}

const { anon, serviceRole } = fetchApiKeys();

writeFileSync(
  join(root, ".env.staging"),
  [
    "# Kwaapo staging v2 — local only (gitignored)",
    "EXPO_PUBLIC_STAGING=1",
    `EXPO_PUBLIC_SUPABASE_URL=${STAGING_URL}`,
    `EXPO_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `EXPO_PUBLIC_KWAAPO_WORKER_BASE=${STAGING_WORKER}`,
    "",
  ].join("\n"),
  "utf8"
);

writeFileSync(
  join(root, ".staging-v2.secrets.local"),
  [
    `SUPABASE_URL=${STAGING_URL}`,
    `SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_SERVICE_ROLE_KEY=${serviceRole}`,
    "",
  ].join("\n"),
  "utf8"
);

const admin = createClient(STAGING_URL, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const buyerPassword = makePassword();
const sellerPassword = makePassword();

for (const [label, id, password] of [
  ["buyer", seed.buyer.id, buyerPassword],
  ["seller", seed.seller.id, sellerPassword],
]) {
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) fail(`${label} password reset: ${error.message}`);
}

const anonClient = createClient(STAGING_URL, anon);
for (const [label, email, password] of [
  ["buyer", seed.buyer.email, buyerPassword],
  ["seller", seed.seller.email, sellerPassword],
]) {
  const { error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) fail(`${label} login verify: ${error.message}`);
  await anonClient.auth.signOut();
}

writeFileSync(
  join(root, ".staging-v2-passwords.local"),
  [
    `buyer_email=${seed.buyer.email}`,
    `buyer_password=${buyerPassword}`,
    `seller_email=${seed.seller.email}`,
    `seller_password=${sellerPassword}`,
    `reset_at=${new Date().toISOString()}`,
    "",
  ].join("\n"),
  "utf8"
);

console.log("[staging-restore] OK: .env.staging + secrets restored");
console.log("[staging-restore] OK: buyer + seller passwords reset and verified");
console.log("[staging-restore] Passwords written to .staging-v2-passwords.local (gitignored)");
