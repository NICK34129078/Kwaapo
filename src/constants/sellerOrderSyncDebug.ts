/** Set false to silence [SellerOrderSync] Metro logs in dev. */
export const SELLER_ORDER_SYNC_DEBUG = __DEV__;

export function logSellerOrderSync(message: string, ...details: unknown[]): void {
  if (!SELLER_ORDER_SYNC_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerOrderSync] ${message}`);
    return;
  }
  console.log(`[SellerOrderSync] ${message}`, ...details);
}

const badgeTimestamps = new Map<string, number>();

export function markSellerOrderBadgeRendered(
  notificationId: string,
  atMs = Date.now()
): void {
  badgeTimestamps.set(notificationId, atMs);
}

export function logSellerOrderToastRendered(notificationId: string, atMs = Date.now()): void {
  const badgeAt = badgeTimestamps.get(notificationId);
  logSellerOrderSync(`toast rendered ${notificationId}`);
  if (badgeAt != null) {
    logSellerOrderSync(`badge-to-toast delta ms ${atMs - badgeAt}`);
    badgeTimestamps.delete(notificationId);
  }
}

export function clearSellerOrderSyncTiming(): void {
  badgeTimestamps.clear();
}
