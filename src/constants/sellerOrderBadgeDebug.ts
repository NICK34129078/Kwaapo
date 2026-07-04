/** Set false to silence [SellerOrderBadge] Metro logs in dev. */
export const SELLER_ORDER_BADGE_DEBUG = __DEV__;

export function logSellerOrderBadge(message: string, ...details: unknown[]): void {
  if (!SELLER_ORDER_BADGE_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerOrderBadge] ${message}`);
    return;
  }
  console.log(`[SellerOrderBadge] ${message}`, ...details);
}
