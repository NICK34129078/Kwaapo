/** Set false to silence [SellerOpenOrders] Metro logs in dev. */
export const SELLER_OPEN_ORDERS_DEBUG = __DEV__;

export function logSellerOpenOrders(message: string, ...details: unknown[]): void {
  if (!SELLER_OPEN_ORDERS_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerOpenOrders] ${message}`);
    return;
  }
  console.log(`[SellerOpenOrders] ${message}`, ...details);
}

export function formatOrderIdsForLog(orderIds: Iterable<string>): string {
  const ids = [...orderIds];
  return ids.length > 0 ? ids.join(", ") : "none";
}
