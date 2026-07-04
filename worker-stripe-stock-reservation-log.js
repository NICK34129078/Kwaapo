/**
 * Stock reservation debug logs for Cloudflare Worker checkout.
 * Disable with env.STOCK_RESERVATION_DEBUG = "0".
 */

/**
 * @param {Record<string, unknown> | undefined} env
 * @returns {string}
 */
export function getSupabaseProjectRef(env) {
  const url = String(env?.SUPABASE_URL ?? "");
  const match = url.match(/https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? "unknown";
}

/**
 * @param {Record<string, unknown> | undefined} env
 * @param {string} event
 * @param {...unknown} details
 */
export function logStockReservation(env, event, ...details) {
  const enabled =
    env?.STOCK_RESERVATION_DEBUG !== "0" &&
    env?.STOCK_RESERVATION_DEBUG !== "false";
  if (!enabled) {
    return;
  }
  const ref = getSupabaseProjectRef(env);
  if (details.length === 0) {
    console.log(`[StockReservation] ${event}`, { supabaseRef: ref });
    return;
  }
  console.log(`[StockReservation] ${event}`, { supabaseRef: ref }, ...details);
}
