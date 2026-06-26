import type { Order } from "../types/order";
import type { SellerOrder } from "../types/order";

/** Eén bron van waarheid: betaald, nog niet verzonden, niet geannuleerd/terugbetaald. */
export function orderNeedsSellerAction(order: Order): boolean {
  return (
    order.paymentStatus === "paid" &&
    order.shippingStatus === "not_shipped" &&
    order.status !== "cancelled" &&
    order.status !== "refunded"
  );
}

export type SellerOrderFilter =
  | "all"
  | "action_required"
  | "shipped"
  | "completed"
  | "cancelled_refunded";

export const SELLER_ORDER_FILTERS: Array<{
  id: SellerOrderFilter;
  label: string;
}> = [
  { id: "action_required", label: "Actie vereist" },
  { id: "shipped", label: "Verzonden" },
  { id: "completed", label: "Afgerond" },
  { id: "cancelled_refunded", label: "Geannuleerd / terugbetaald" },
];

export function matchesSellerOrderFilter(
  order: Order,
  filter: SellerOrderFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "action_required":
      return orderNeedsSellerAction(order);
    case "shipped":
      return order.shippingStatus === "shipped";
    case "completed":
      return (
        order.shippingStatus === "delivered" || order.status === "completed"
      );
    case "cancelled_refunded":
      return (
        order.status === "cancelled" ||
        order.status === "refunded" ||
        order.paymentStatus === "refunded"
      );
    default:
      return true;
  }
}

export function countSellerOrdersNeedingAttention(
  orders: SellerOrder[]
): number {
  return orders.filter((row) => orderNeedsSellerAction(row.order)).length;
}

function sellerOrderPriority(order: Order): number {
  if (orderNeedsSellerAction(order)) {
    return 0;
  }
  if (
    order.shippingStatus === "shipped" ||
    order.shippingStatus === "delivered"
  ) {
    return 1;
  }
  if (order.paymentStatus === "unpaid" || order.paymentStatus === "failed") {
    return 2;
  }
  return 3;
}

/** Actie vereist bovenaan, daarna nieuwste eerst. */
export function sortSellerOrders(orders: SellerOrder[]): SellerOrder[] {
  return [...orders].sort((a, b) => {
    const priorityDiff =
      sellerOrderPriority(a.order) - sellerOrderPriority(b.order);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return (
      new Date(b.order.createdAt).getTime() -
      new Date(a.order.createdAt).getTime()
    );
  });
}

export function sellerFulfillmentLabel(order: Order): string {
  if (orderNeedsSellerAction(order)) {
    return "Actie vereist";
  }
  if (order.paymentStatus === "unpaid") {
    return "Wacht op betaling";
  }
  if (order.paymentStatus === "failed") {
    return "Betaling mislukt";
  }
  if (order.paymentStatus === "refunded" || order.status === "refunded") {
    return "Terugbetaald";
  }
  if (order.status === "cancelled") {
    return "Geannuleerd";
  }
  if (order.shippingStatus === "shipped") {
    return "Verzonden";
  }
  if (order.shippingStatus === "delivered" || order.status === "completed") {
    return "Afgerond";
  }
  return "Bestelling";
}
