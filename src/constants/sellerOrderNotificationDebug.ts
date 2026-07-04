/** Set false to silence [SellerOrderNotification] Metro logs in dev. */
export const SELLER_ORDER_NOTIFICATION_DEBUG = __DEV__;

export function logSellerOrderNotification(
  message: string,
  ...details: unknown[]
): void {
  if (!SELLER_ORDER_NOTIFICATION_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerOrderNotification] ${message}`);
    return;
  }
  console.log(`[SellerOrderNotification] ${message}`, ...details);
}
