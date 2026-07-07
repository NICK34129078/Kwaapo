import type { SellerNotification } from "../services/sellerNotificationService";
import type { Order } from "../types/order";
import { orderNeedsSellerAction } from "./sellerFulfillment";

export function sellerNotificationNeedsAction(
  notification: SellerNotification,
  order?: Pick<Order, "paymentStatus" | "shippingStatus" | "status"> | null,
  fulfillmentStatus?: string | null
): boolean {
  if (notification.notificationType === "order_refunded") {
    return false;
  }
  if (notification.handledAt) {
    return false;
  }
  if (order) {
    return orderNeedsSellerAction(order, { fulfillmentStatus });
  }
  return notification.notificationType === "new_paid_order";
}

export function sellerNotificationIsHandled(
  notification: SellerNotification,
  order?: Pick<Order, "paymentStatus" | "shippingStatus" | "status"> | null,
  fulfillmentStatus?: string | null
): boolean {
  if (notification.handledAt) {
    return true;
  }
  if (notification.notificationType === "order_refunded") {
    return true;
  }
  if (!order) {
    return false;
  }
  if (order.status === "cancelled" || order.status === "refunded") {
    return true;
  }
  if (
    order.shippingStatus === "shipped" ||
    order.shippingStatus === "delivered" ||
    order.status === "shipped" ||
    order.status === "completed"
  ) {
    return true;
  }
  return !orderNeedsSellerAction(order, { fulfillmentStatus });
}
