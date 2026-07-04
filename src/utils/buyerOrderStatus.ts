import type { Order } from "../types/order";

export type BuyerOrderDisplayStatus =
  | "awaiting_payment"
  | "paid_awaiting_shipment"
  | "processing"
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
  if (order.status === "processing") {
    return "processing";
  }
  return "paid_awaiting_shipment";
}

export function buyerOrderStatusLabel(order: Order): string {
  switch (buyerOrderDisplayStatus(order)) {
    case "awaiting_payment":
      return "Betaling in behandeling";
    case "paid_awaiting_shipment":
      return "Betaald";
    case "processing":
      return "Wordt verwerkt";
    case "shipped":
      return "Verzonden";
    case "delivered":
      return "Bezorgd";
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
  if (status === "paid_awaiting_shipment" || status === "processing") {
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
