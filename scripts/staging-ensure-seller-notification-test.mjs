/**
 * Staging-only: verify ensureSellerNewPaidOrderNotification idempotency.
 * Usage: node scripts/staging-ensure-seller-notification-test.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureSellerNewPaidOrderNotification } from "../worker-stripe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const STAGING_REF = "xwezgyelwovczuqyyqwu";
const ORDER_ID = "90d6d223-18b3-4666-b6c5-9223be280ae1";

function dbQuery(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const result = spawnSync(`npx supabase db query --linked --yes "${escaped}"`, {
    shell: true,
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "db query failed");
  }
  return JSON.parse(result.stdout);
}

function notifCount() {
  const res = dbQuery(
    `select count(*)::int as c from seller_notifications where order_id = '${ORDER_ID}' and notification_type = 'new_paid_order'`
  );
  return res.rows?.[0]?.c ?? 0;
}

function loadStagingEnv() {
  const keysResult = spawnSync(
    `npx supabase projects api-keys --project-ref ${STAGING_REF}`,
    { shell: true, cwd: root, encoding: "utf8" }
  );
  if (keysResult.status !== 0) {
    throw new Error(keysResult.stderr || keysResult.stdout || "api-keys failed");
  }
  const parsed = JSON.parse(keysResult.stdout);
  const serviceRole = parsed.keys?.find((k) => k.name === "service_role")?.api_key;
  if (!serviceRole) {
    throw new Error("service_role key not found for staging v2");
  }
  return {
    SUPABASE_URL: `https://${STAGING_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: serviceRole,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`OK: ${message}`);
}

async function main() {
  const pwd = spawnSync(
    'powershell -NoProfile -Command "(Get-Content .staging-v2-db-password.local -Raw).Trim()"',
    { shell: true, cwd: root, encoding: "utf8" }
  );
  if (pwd.status !== 0 || !pwd.stdout.trim()) {
    throw new Error("Missing .staging-v2-db-password.local");
  }
  const link = spawnSync(
    `npx supabase link --project-ref ${STAGING_REF} --password "${pwd.stdout.trim()}" --yes`,
    { shell: true, cwd: root, encoding: "utf8" }
  );
  if (link.status !== 0) {
    throw new Error(link.stderr || link.stdout || "supabase link failed");
  }
  assert(true, `linked to staging v2 (${STAGING_REF})`);

  const env = loadStagingEnv();
  const before = notifCount();
  console.log("initial notification count:", before);

  await ensureSellerNewPaidOrderNotification(env, ORDER_ID);
  await ensureSellerNewPaidOrderNotification(env, ORDER_ID);
  const afterDuplicateCalls = notifCount();
  assert(
    afterDuplicateCalls === before,
    `duplicate ensure calls did not add rows (${before} -> ${afterDuplicateCalls})`
  );

  dbQuery(
    `delete from seller_notifications where order_id = '${ORDER_ID}' and notification_type = 'new_paid_order'`
  );
  assert(notifCount() === 0, "notification removed for backfill simulation");

  await ensureSellerNewPaidOrderNotification(env, ORDER_ID);
  assert(notifCount() === 1, "already-paid backfill created exactly one notification");

  await ensureSellerNewPaidOrderNotification(env, ORDER_ID);
  assert(notifCount() === 1, "second ensure still leaves exactly one notification");

  console.log("\nstaging-ensure-seller-notification-test.mjs: all checks passed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
