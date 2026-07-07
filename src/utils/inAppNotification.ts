import i18n from "../i18n/index";

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

export const IN_APP_NOTIFICATION_VISIBLE_MS = 5000;

/** Alias for order in-app toast auto-dismiss duration. */
export const IN_APP_ORDER_TOAST_DURATION_MS = IN_APP_NOTIFICATION_VISIBLE_MS;

/** Pending fetch may only replay toasts for events this recent (ms). */
export const IN_APP_TOAST_PENDING_MAX_AGE_MS = 60_000;

export const IN_APP_TOAST_PENDING_MAX_AGE_SECONDS = 60;

export function inAppToastPendingCutoffIso(nowMs = Date.now()): string {
  return new Date(nowMs - IN_APP_TOAST_PENDING_MAX_AGE_MS).toISOString();
}

/** @deprecated Use IN_APP_TOAST_PENDING_MAX_AGE_SECONDS */
export const SELLER_TOAST_RECENCY_HOURS = IN_APP_TOAST_PENDING_MAX_AGE_SECONDS / 3600;

export function sellerToastRecencyCutoffIso(nowMs = Date.now()): string {
  return inAppToastPendingCutoffIso(nowMs);
}

export function buyerToastRecencyCutoffIso(nowMs = Date.now()): string {
  return inAppToastPendingCutoffIso(nowMs);
}

export function notificationAgeMs(createdAt: string, nowMs = Date.now()): number {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, nowMs - parsed);
}

export function isPendingToastTooOld(createdAt: string, nowMs = Date.now()): boolean {
  return notificationAgeMs(createdAt, nowMs) > IN_APP_TOAST_PENDING_MAX_AGE_MS;
}

export function sellerNewOrderToastTitle(): string {
  return i18n.t("notifications.sellerNewOrderTitle");
}

export function sellerNewOrderToastSubtitle(): string {
  return i18n.t("notifications.sellerNewOrderSubtitle");
}

export function sellerNewOrderToastBody(
  productName: string,
  amountLabel: string
): string {
  const name = productName.trim() || i18n.t("common.product");
  return i18n.t("notifications.sellerNewOrderBody", {
    product: name,
    amount: amountLabel,
  });
}

export const NOTIFICATION_SUBTITLES: Record<string, string | undefined> = {
  get new_paid_order() {
    return i18n.t("notifications.sellerNewOrderSubtitle");
  },
  get order_shipped() {
    return i18n.t("notifications.buyerShippedSubtitle");
  },
};

export function buyerOrderShippedToastTitle(): string {
  return i18n.t("notifications.buyerShippedTitle");
}

export function buyerOrderShippedToastBody(
  productName: string | null | undefined,
  sellerName: string | null | undefined
): string {
  const product = productName?.trim() || i18n.t("orders.orders");
  const seller = sellerName?.trim() || i18n.t("shop.seller");
  return i18n.t("notifications.buyerShippedBody", {
    product,
    seller,
  });
}

export function buyerOrderShippedToastSubtitle(): string {
  return i18n.t("notifications.buyerShippedSubtitle");
}

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
