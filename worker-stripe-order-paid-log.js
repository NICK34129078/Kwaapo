/**
 * Structured payment reconciliation logs for Cloudflare Worker (no secrets / PII).
 * Disable in production by setting env.STRIPE_ORDER_PAID_DEBUG = "0".
 */

/**
 * @param {Record<string, unknown> | undefined} env
 * @param {string} event
 * @param {...unknown} details
 */
export function logStripeOrderPaid(env, event, ...details) {
  const enabled =
    env?.STRIPE_ORDER_PAID_DEBUG !== "0" &&
    env?.STRIPE_ORDER_PAID_DEBUG !== "false";
  if (!enabled) {
    return;
  }
  if (details.length === 0) {
    console.log(`[StripeOrderPaid] ${event}`);
    return;
  }
  console.log(`[StripeOrderPaid] ${event}`, ...details);
}
