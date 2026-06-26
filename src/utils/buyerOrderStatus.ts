import type { Order } from "../types/order";

export type BuyerOrderDisplayStatus =
  | "awaiting_payment"
  | "paid_awaiting_shipment"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "payment_failed";

/** Gecombineerde koperstatus — één label i.p.v. losse betaal/verzend-badges. */
export function buyerOrderDisplayStatus(order: Order): BuyerOrderDisplayStatus {
  if (order.status === "cancelled") {
    return "cancelled";
  }
  if (order.paymentStatus === "refunded" || order.status === "refunded") {
    return "refunded";
  }
  if (order.paymentStatus === "failed") {
    return "payment_failed";
  }
  if (order.paymentStatus !== "paid") {
    return "awaiting_payment";
  }
  if (order.shippingStatus === "delivered") {
    return "delivered";
  }
  if (order.shippingStatus === "shipped") {
    return "shipped";
  }
  return "paid_awaiting_shipment";
}

export function buyerOrderStatusLabel(order: Order): string {
  switch (buyerOrderDisplayStatus(order)) {
    case "awaiting_payment":
      return "Wacht op betaling";
    case "paid_awaiting_shipment":
      return "Betaald — wacht op verzending";
    case "shipped":
      return "Onderweg";
    case "delivered":
      return "Afgeleverd";
    case "cancelled":
      return "Geannuleerd";
    case "refunded":
      return "Terugbetaald";
    case "payment_failed":
      return "Betaling mislukt";
    default:
      return "Onbekend";
  }
}

export function buyerOrderStatusTone(
  order: Order
): "muted" | "accent" | "success" | "danger" {
  const status = buyerOrderDisplayStatus(order);
  if (status === "paid_awaiting_shipment") {
    return "accent";
  }
  if (status === "shipped" || status === "delivered") {
    return "success";
  }
  if (status === "cancelled" || status === "refunded" || status === "payment_failed") {
    return "danger";
  }
  return "muted";
}
