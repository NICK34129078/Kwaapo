/**
 * Staging smoke tests (no production).
 * Run: node scripts/staging-checkout-smoke.mjs
 */
const STAGING_WORKER =
  process.env.KWAAPO_STAGING_WORKER_URL ??
  "https://kwaapo-staging-checkout.n-vandullemen.workers.dev";

async function main() {
  const healthRes = await fetch(`${STAGING_WORKER}?health=1`);
  const healthBody = await healthRes.text();
  console.log("[health]", healthRes.status, healthBody);
  if (!healthRes.ok || !healthBody.includes('"ok":true')) {
    throw new Error("Staging health check failed");
  }

  const webhookRes = await fetch(`${STAGING_WORKER}?stripeWebhook=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": "t=0,v1=invalid" },
    body: JSON.stringify({ id: "evt_smoke", type: "checkout.session.completed", data: { object: {} } }),
  });
  const webhookText = await webhookRes.text();
  console.log("[webhook invalid sig]", webhookRes.status, webhookText.slice(0, 200));
  if (webhookRes.status === 200) {
    throw new Error("Expected non-200 for invalid webhook signature");
  }
  console.log("staging-checkout-smoke.mjs: ok (health + webhook rejects bad sig)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
