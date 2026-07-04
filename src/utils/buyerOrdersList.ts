import type { OrderItem } from "../types/order";

export const BUYER_ORDERS_PAGE_SIZE = 20;

export function buyerOrdersPageHasMore(fetchedCount: number, pageSize: number): boolean {
  return fetchedCount === pageSize;
}

export function formatOrderReference(orderId: string): string {
  const trimmed = orderId.trim();
  if (!trimmed) {
    return "";
  }
  return `#${trimmed.slice(0, 8)}`;
}

export function formatOrderItemQuantityLine(
  item: Pick<OrderItem, "quantity"> | null | undefined
): string | null {
  const quantity = Math.floor(Number(item?.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) {
    return null;
  }
  return quantity === 1 ? "1 stuk" : `${quantity} stuks`;
}
