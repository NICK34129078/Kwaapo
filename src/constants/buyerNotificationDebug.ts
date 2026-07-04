/** Set false to silence [BuyerNotification] Metro logs in dev. */
export const BUYER_NOTIFICATION_DEBUG = __DEV__;

export function logBuyerNotification(
  message: string,
  ...details: unknown[]
): void {
  if (!BUYER_NOTIFICATION_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[BuyerNotification] ${message}`);
    return;
  }
  console.log(`[BuyerNotification] ${message}`, ...details);
}
