export type InAppNotificationAudience = "buyer" | "seller";

export type InAppNotificationPayload = {
  id: string;
  orderId: string;
  audience: InAppNotificationAudience;
  notificationType: string;
  title: string;
  body: string;
  subtitle?: string | null;
  productImageUrl?: string | null;
  productName?: string | null;
  variantLabel?: string | null;
  amountLabel?: string | null;
  orderReference: string;
  createdAt: string;
};

export const IN_APP_NOTIFICATION_VISIBLE_MS = 2800;

export function sellerNewOrderToastTitle(): string {
  return "Nieuwe bestelling ontvangen";
}

export function sellerNewOrderToastBody(
  productName: string,
  amountLabel: string
): string {
  const name = productName.trim() || "Product";
  return `${name} verkocht voor ${amountLabel}.`;
}

export const NOTIFICATION_SUBTITLES: Record<string, string | undefined> = {
  order_shipped: "Volg je pakket met de trackinginformatie.",
};

export function notificationOrderReference(orderId: string): string {
  const trimmed = orderId.trim();
  if (!trimmed) {
    return "";
  }
  return `#${trimmed.slice(0, 8)}`;
}

export function shouldSuppressInAppNotification(
  currentRouteName: string | undefined,
  currentOrderId: string | undefined,
  payload: Pick<InAppNotificationPayload, "orderId">
): boolean {
  if (currentRouteName !== "OrderDetail") {
    return false;
  }
  return currentOrderId === payload.orderId;
}

export function enqueueInAppNotification(
  queue: InAppNotificationPayload[],
  next: InAppNotificationPayload
): InAppNotificationPayload[] {
  if (queue.some((item) => item.id === next.id)) {
    return queue;
  }
  return [...queue, next];
}

export function dequeueInAppNotification(
  queue: InAppNotificationPayload[]
): InAppNotificationPayload[] {
  if (queue.length <= 1) {
    return [];
  }
  return queue.slice(1);
}
