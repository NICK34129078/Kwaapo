import type { Order, PaymentStatus, ShippingStatus } from "../types/order";
import type { SellerOrder } from "../types/order";

export type SellerOrderFilter =
  | "all"
  | "new"
  | "paid"
  | "to_ship"
  | "shipped"
  | "completed";

export const SELLER_ORDER_FILTERS: Array<{
  id: SellerOrderFilter;
  label: string;
}> = [
  { id: "new", label: "Nieuw" },
  { id: "paid", label: "Betaald" },
  { id: "to_ship", label: "Te verzenden" },
  { id: "shipped", label: "Verzonden" },
  { id: "completed", label: "Afgerond" },
];

export function paymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case "unpaid":
      return "Niet betaald";
    case "paid":
      return "Betaald";
    case "failed":
      return "Mislukt";
    case "refunded":
      return "Terugbetaald";
  }
}

export function shippingStatusLabel(status: ShippingStatus): string {
  switch (status) {
    case "shipped":
      return "Verzonden";
    case "delivered":
      return "Afgeleverd";
    default:
      return "Nog niet verzonden";
  }
}

export function matchesSellerOrderFilter(
  order: Order,
  filter: SellerOrderFilter
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "new":
      return order.paymentStatus === "unpaid";
    case "paid":
      return order.paymentStatus === "paid";
    case "to_ship":
      return (
        order.paymentStatus === "paid" && order.shippingStatus === "not_shipped"
      );
    case "shipped":
      return (
        order.shippingStatus === "shipped" || order.shippingStatus === "delivered"
      );
    case "completed":
      return (
        order.status === "completed" || order.shippingStatus === "delivered"
      );
    default:
      return true;
  }
}

/** Orders die aandacht van de verkoper nodig hebben (badge). */
export function countSellerOrdersNeedingAttention(orders: SellerOrder[]): number {
  return orders.filter(
    (row) =>
      row.order.paymentStatus === "unpaid" ||
      (row.order.paymentStatus === "paid" &&
        row.order.shippingStatus === "not_shipped")
  ).length;
}

export function buyerDisplayName(
  sellerOrder: SellerOrder,
  fallback = "Koper"
): string {
  return (
    sellerOrder.order.buyerFullName?.trim() ||
    sellerOrder.buyer?.displayName?.trim() ||
    sellerOrder.buyer?.username?.trim() ||
    fallback
  );
}
