/**
 * Sync staging v2 Supabase + KVK secrets to kwaapo-staging-checkout worker only.
 * Usage: node scripts/staging-sync-worker-secrets.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PROD_REF = "mvngamvkdtcprgiizcvk";

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
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

function putSecret(name, value) {
  const result = spawnSync(
    "npx",
    ["wrangler", "secret", "put", name, "--config", "wrangler.staging.jsonc"],
    {
      input: value,
      encoding: "utf8",
      shell: true,
    }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `secret put ${name} failed`);
  }
  console.log(`[staging-sync] updated worker secret: ${name}`);
}

const secrets = parseEnvFile(".staging-v2.secrets.local");
const devVars = parseEnvFile(".dev.vars");

if (!secrets.SUPABASE_URL?.includes(STAGING_REF)) {
  throw new Error("Refusing: secrets file is not staging v2");
}
if (secrets.SUPABASE_URL.includes(PROD_REF)) {
  throw new Error("Refusing: secrets file points at production");
}

for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
  const value = secrets[name];
  if (!value) throw new Error(`Missing ${name} in .staging-v2.secrets.local`);
  putSecret(name, value);
}

const kvkKey = devVars.KVK_API_KEY?.trim();
const kvkBase = devVars.KVK_API_BASE?.trim();
if (kvkKey) {
  putSecret("KVK_API_KEY", kvkKey);
  if (kvkBase) {
    putSecret("KVK_API_BASE", kvkBase);
  }
} else {
  console.warn("[staging-sync] WARN: KVK_API_KEY missing in .dev.vars — checkout may block business sellers");
}

console.log("[staging-sync] OK: staging worker secrets synced for v2 checkout");
