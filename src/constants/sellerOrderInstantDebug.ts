/** Set false to silence [SellerOrderInstant] Metro logs in dev. */
export const SELLER_ORDER_INSTANT_DEBUG = __DEV__;

export function logSellerOrderInstant(
  message: string,
  ...details: unknown[]
): void {
  if (!SELLER_ORDER_INSTANT_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerOrderInstant] ${message}`);
    return;
  }
  console.log(`[SellerOrderInstant] ${message}`, ...details);
}

const badgeTimestamps = new Map<string, number>();

export function markSellerOrderInstantBadgeRendered(
  notificationId: string,
  atMs = Date.now()
): void {
  badgeTimestamps.set(notificationId, atMs);
}

export function logSellerOrderInstantToastRendered(
  notificationId: string,
  routeName: string,
  atMs = Date.now()
): void {
  logSellerOrderInstant(`toast rendered ${notificationId} ${routeName}`);
  const badgeAt = badgeTimestamps.get(notificationId);
  if (badgeAt != null) {
    logSellerOrderInstant(`badge-to-toast delta ms ${atMs - badgeAt}`);
    badgeTimestamps.delete(notificationId);
  }
}

export function clearSellerOrderInstantTiming(): void {
  badgeTimestamps.clear();
}
