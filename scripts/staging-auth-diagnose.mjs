/**
 * Diagnose staging auth + env (no secrets printed).
 * Usage: node scripts/staging-auth-diagnose.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PROD_REF = "mvngamvkdtcprgiizcvk";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function hostRef(url = "") {
  const m = url.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return m?.[1] ?? "missing";
}

function fetchStagingKeys() {
  const result = spawnSync(
    `npx supabase projects api-keys --project-ref ${STAGING_REF}`,
    { cwd: root, encoding: "utf8", shell: true }
  );
  if (result.status !== 0) throw new Error("api-keys fetch failed");
  const payload = JSON.parse(result.stdout);
  return {
    anon: payload.keys?.find((k) => k.id === "anon")?.api_key,
    serviceRole: payload.keys?.find((k) => k.id === "service_role")?.api_key,
  };
}

function readPasswords() {
  const path = join(root, ".staging-v2-passwords.local");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

const seed = JSON.parse(readFileSync(join(root, ".staging-v2-seed.json"), "utf8"));
const dotEnv = parseEnvFile(join(root, ".env"));
const stagingEnv = parseEnvFile(join(root, ".env.staging"));
const passwords = readPasswords();
const { anon, serviceRole } = fetchStagingKeys();
const stagingUrl = `https://${STAGING_REF}.supabase.co`;

console.log("=== Env files on disk ===");
console.log(".env supabase ref:", hostRef(dotEnv.EXPO_PUBLIC_SUPABASE_URL));
console.log(".env.staging supabase ref:", hostRef(stagingEnv.EXPO_PUBLIC_SUPABASE_URL));
console.log(".env.staging worker host:", (stagingEnv.EXPO_PUBLIC_KWAAPO_WORKER_BASE ?? "").includes("kwaapo-staging-checkout"));
console.log(".env has EXPO_PUBLIC_STAGING:", dotEnv.EXPO_PUBLIC_STAGING ?? "(unset)");

console.log("\n=== Simulated Expo bundle env (Expo loads .env after shell env) ===");
const simulatedBundle = {
  ...process.env,
  ...dotEnv,
};
console.log("bundle supabase ref if only process+dotenv merge:", hostRef(simulatedBundle.EXPO_PUBLIC_SUPABASE_URL));

const admin = createClient(stagingUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log("\n=== Staging Auth users (admin) ===");
for (const [label, id, email] of [
  ["buyer", seed.buyer.id, seed.buyer.email],
  ["seller", seed.seller.id, seed.seller.email],
]) {
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error) {
    console.log(`${label}: MISSING/ERROR`, error.message);
    continue;
  }
  const u = data.user;
  console.log(`${label}:`, {
    id: u.id,
    email: u.email,
    confirmed: u.email_confirmed_at != null,
    banned: u.banned_until != null,
    lastSignIn: u.last_sign_in_at,
  });
}

console.log("\n=== Server-side password login (staging anon key) ===");
const anonClient = createClient(stagingUrl, anon);
for (const [label, emailKey, passKey] of [
  ["buyer", "buyer_email", "buyer_password"],
  ["seller", "seller_email", "seller_password"],
]) {
  const email = passwords[emailKey] ?? seed.buyer.email;
  const password = passwords[passKey];
  if (!password) {
    console.log(`${label}: SKIP (no local password file)`);
    continue;
  }
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: passwords[emailKey],
    password,
  });
  console.log(
    `${label}:`,
    error ? `FAIL ${error.message}` : `OK user=${data.user?.id?.slice(0, 8)}...`
  );
  if (!error) await anonClient.auth.signOut();
}

// Wrong-project simulation: prod anon against staging creds
const prodUrl = dotEnv.EXPO_PUBLIC_SUPABASE_URL;
const prodAnon = dotEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (prodUrl?.includes(PROD_REF) && prodAnon && passwords.buyer_password) {
  console.log("\n=== Wrong-project simulation (.env production URL + staging password) ===");
  const prodClient = createClient(prodUrl, prodAnon);
  const { error } = await prodClient.auth.signInWithPassword({
    email: passwords.buyer_email,
    password: passwords.buyer_password,
  });
  console.log("buyer on production URL:", error ? `FAIL ${error.message}` : "OK (unexpected)");
}
