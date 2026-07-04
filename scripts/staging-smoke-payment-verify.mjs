/**
 * Post-payment verification for staging v2 checkout smoke test.
 * Usage: node scripts/staging-smoke-payment-verify.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const STAGING_REF = "xwezgyelwovczuqyyqwu";
const PRODUCT_ID = "ba6d4777-bde4-4f5a-bf1a-46c8c7cc364c";
const PRODUCT_PRICE = 19.99;
const EXPECTED_FEE = Math.round(PRODUCT_PRICE * 0.125 * 100) / 100;
const EXPECTED_SELLER = Math.round((PRODUCT_PRICE - EXPECTED_FEE) * 100) / 100;

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

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`OK: ${message}`);
}

function main() {
  const linkedRef = readFileSync(join(root, "supabase/.temp/project-ref"), "utf8").trim();
  assert(linkedRef === STAGING_REF, `CLI linked to staging v2 (${STAGING_REF})`);
  assert(linkedRef !== "mvngamvkdtcprgiizcvk", "not linked to production");

  const seedPath = join(root, ".staging-v2-seed.json");
  assert(existsSync(seedPath), ".staging-v2-seed.json present");
  const seed = JSON.parse(readFileSync(seedPath, "utf8"));

  const orders = dbQuery(
    `select o.id, o.stripe_checkout_session_id, o.payment_status, o.fulfillment_status, o.paid_at, o.payment_reconciled_at, o.platform_fee_amount::float8 as platform_fee_amount, o.seller_amount::float8 as seller_amount, o.subtotal_amount::float8 as subtotal_amount, o.stock_committed_at, o.created_at, p.stock as product_stock_now from orders o join order_items oi on oi.order_id = o.id join products p on p.id = oi.product_id where oi.product_id = '${PRODUCT_ID}' and o.payment_status = 'paid' order by o.paid_at desc nulls last limit 1`
  );
  const order = orders.rows?.[0];
  assert(!!order?.id, "paid order found for Staging Simple Tee");

  const dup = dbQuery(
    `select count(*)::int as order_count, count(distinct stripe_checkout_session_id)::int as distinct_sessions from orders where payment_status = 'paid' and stripe_checkout_session_id is not null and buyer_id = '${seed.buyer.id}'`
  );
  const dupRow = dup.rows?.[0] ?? {};

  const sessionDup = order.stripe_checkout_session_id
    ? dbQuery(
        `select count(*)::int as c from orders where stripe_checkout_session_id = '${order.stripe_checkout_session_id}'`
      ).rows?.[0]?.c ?? 0
    : 0;

  const notifs = dbQuery(
    `select count(*)::int as c from seller_notifications where seller_id = '${seed.seller.id}' and order_id = '${order.id}' and notification_type = 'new_paid_order'`
  );
  const notifCount = notifs.rows?.[0]?.c ?? 0;

  console.log("\n--- staging payment verify ---");
  console.log("order_id:", order.id);
  console.log("stripe_checkout_session_id:", order.stripe_checkout_session_id ?? "(null)");
  console.log("payment_status:", order.payment_status);
  console.log("fulfillment_status:", order.fulfillment_status ?? "(null)");
  console.log("paid_at:", order.paid_at ?? "(null)");
  console.log("stock_committed_at:", order.stock_committed_at ?? "(null)");
  console.log("product_stock_now:", order.product_stock_now);
  console.log("platform_fee_amount:", order.platform_fee_amount);
  console.log("seller_amount:", order.seller_amount);
  console.log("seller_notifications_for_order:", notifCount);
  console.log("paid_orders_buyer:", dupRow.order_count);
  console.log("distinct_checkout_sessions:", dupRow.distinct_sessions);
  console.log("duplicate_session_rows:", sessionDup);

  assert(order.stripe_checkout_session_id?.startsWith("cs_"), "Stripe Checkout Session ID present");
  assert(order.payment_status === "paid", "payment_status is paid");
  assert(
    order.fulfillment_status === "committed" || order.fulfillment_status === "reconciled",
    "fulfillment_status committed or reconciled"
  );
  assert(order.stock_committed_at != null, "stock committed");
  assert(Number(order.product_stock_now) === 0, "product stock now 0 (was 1 before sale)");
  assert(Number(order.platform_fee_amount) === EXPECTED_FEE, `platform fee ${EXPECTED_FEE}`);
  assert(Number(order.seller_amount) === EXPECTED_SELLER, `seller amount ${EXPECTED_SELLER}`);
  assert(dupRow.order_count === 1, "exactly one paid order for buyer");
  assert(dupRow.distinct_sessions === 1, "exactly one checkout session");
  assert(sessionDup === 1, "no duplicate rows for same checkout session");
  assert(notifCount === 1, "exactly one seller notification for order");

  console.log("\nstaging-smoke-payment-verify.mjs: all checks passed.");
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
