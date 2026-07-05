import { supabase } from "../lib/supabase";
import { logBuyerNotification } from "../constants/buyerNotificationDebug";
import { logBuyerShipmentToast } from "../constants/buyerShipmentToastDebug";
import { logSellerOrderNotification } from "../constants/sellerOrderNotificationDebug";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderItemSizeLabel,
} from "../utils/orderDashboard";
import {
  buyerOrderShippedToastBody,
  buyerOrderShippedToastSubtitle,
  buyerOrderShippedToastTitle,
  NOTIFICATION_SUBTITLES,
  notificationOrderReference,
  sellerNewOrderToastBody,
  sellerNewOrderToastSubtitle,
  sellerNewOrderToastTitle,
  type InAppNotificationAudience,
  type InAppNotificationPayload,
} from "../utils/inAppNotification";
import type { BuyerOrder, OrderParticipant } from "../types/order";
import type { SellerOrderDetail, SellerOrderListRow } from "./ordersService";

type SellerNotificationRow = {
  id: string;
  order_id: string;
  notification_type: string;
  title: string;
  body: string;
  product_name: string | null;
  created_at: string;
};

type BuyerNotificationRow = {
  id: string;
  order_id: string;
  notification_type: string;
  title: string;
  body: string;
  product_name: string | null;
  created_at: string;
};

function firstProductImage(
  items: Array<{ product?: { images?: string[] } }>
): string | null {
  const image = items[0]?.product?.images?.[0];
  return image && image.trim().length > 0 ? image : null;
}

function sellerDisplayName(seller: OrderParticipant | null | undefined): string {
  return (
    seller?.displayName?.trim() ||
    seller?.username?.trim() ||
    "de verkoper"
  );
}

function parseSellerNameFromShippedBody(body: string): string | null {
  const match = body.match(/\sis verzonden door\s(.+?)\.\s*(?:Volg je pakket|$)/i);
  return match?.[1]?.trim() || null;
}

function buildPayloadFromSellerOrder(
  row: SellerNotificationRow,
  sellerOrder: SellerOrderListRow | SellerOrderDetail
): InAppNotificationPayload {
  const firstItem = sellerOrder.items[0];
  const order = sellerOrder.order;
  const variantLabel = formatOrderItemSizeLabel(firstItem);

  const productName = row.product_name ?? firstItem?.product?.name ?? "Product";
  const amountLabel = formatPriceEur(order.subtotalAmount);

  return {
    id: row.id,
    orderId: row.order_id,
    audience: "seller",
    notificationType: row.notification_type,
    title:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastTitle()
        : row.title,
    body:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastBody(productName, amountLabel)
        : row.body,
    subtitle:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastSubtitle()
        : null,
    productImageUrl: firstProductImage(sellerOrder.items),
    productName,
    variantLabel,
    amountLabel,
    orderReference: notificationOrderReference(order.id),
    createdAt: row.created_at,
  };
}

function buildPayloadFromBuyerOrder(
  row: BuyerNotificationRow,
  buyerOrder: BuyerOrder
): InAppNotificationPayload {
  const firstItem = buyerOrder.items[0];
  const order = buyerOrder.order;
  const variantLabel = formatOrderItemSizeLabel(firstItem);
  const productName = row.product_name ?? firstItem?.product?.name ?? null;
  const sellerName = sellerDisplayName(buyerOrder.seller);
  const isOrderShipped = row.notification_type === "order_shipped";

  return {
    id: row.id,
    orderId: row.order_id,
    audience: "buyer",
    notificationType: row.notification_type,
    title: isOrderShipped ? buyerOrderShippedToastTitle() : row.title,
    body: isOrderShipped
      ? buyerOrderShippedToastBody(productName, sellerName)
      : row.body,
    subtitle: isOrderShipped
      ? buyerOrderShippedToastSubtitle()
      : NOTIFICATION_SUBTITLES[row.notification_type] ?? null,
    productImageUrl: firstProductImage(buyerOrder.items),
    productName,
    variantLabel,
    amountLabel: formatPriceEur(order.subtotalAmount),
    orderReference: notificationOrderReference(order.id),
    createdAt: row.created_at,
  };
}

export function buildFallbackPayload(
  row: SellerNotificationRow | BuyerNotificationRow,
  audience: InAppNotificationAudience
): InAppNotificationPayload {
  const productName = row.product_name?.trim() || "Product";
  const isSellerNewPaid =
    audience === "seller" && row.notification_type === "new_paid_order";
  const isBuyerShipped =
    audience === "buyer" && row.notification_type === "order_shipped";
  const parsedSellerName =
    isBuyerShipped && "body" in row
      ? parseSellerNameFromShippedBody(row.body)
      : null;

  return {
    id: row.id,
    orderId: row.order_id,
    audience,
    notificationType: row.notification_type,
    title: isSellerNewPaid
      ? sellerNewOrderToastTitle()
      : isBuyerShipped
        ? buyerOrderShippedToastTitle()
        : row.title,
    body: isSellerNewPaid
      ? sellerNewOrderToastBody(productName, "")
      : isBuyerShipped
        ? buyerOrderShippedToastBody(row.product_name, parsedSellerName)
        : row.body,
    subtitle: isBuyerShipped
      ? buyerOrderShippedToastSubtitle()
      : isSellerNewPaid
        ? sellerNewOrderToastSubtitle()
        : NOTIFICATION_SUBTITLES[row.notification_type] ?? null,
    productImageUrl: null,
    productName: row.product_name,
    variantLabel: null,
    amountLabel: null,
    orderReference: notificationOrderReference(row.order_id),
    createdAt: row.created_at,
  };
}

export function buildSellerNotificationFallback(
  row: SellerNotificationRow
): InAppNotificationPayload {
  const productName = row.product_name?.trim() || "Product";
  const amountMatch = row.body.match(/verkocht voor ([^.,]+)/i);
  const amountLabel = amountMatch?.[1]?.trim() ?? "";

  return {
    id: row.id,
    orderId: row.order_id,
    audience: "seller",
    notificationType: row.notification_type,
    title:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastTitle()
        : row.title,
    body:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastBody(productName, amountLabel)
        : row.body,
    subtitle:
      row.notification_type === "new_paid_order"
        ? sellerNewOrderToastSubtitle()
        : null,
    productImageUrl: null,
    productName: row.product_name,
    variantLabel: null,
    amountLabel: amountLabel || null,
    orderReference: notificationOrderReference(row.order_id),
    createdAt: row.created_at,
  };
}

export async function enrichSellerNotification(
  row: SellerNotificationRow
): Promise<InAppNotificationPayload> {
  const { fetchSellerOrderById } = await import("./ordersService");
  try {
    const sellerOrder = await fetchSellerOrderById(row.order_id);
    if (!sellerOrder) {
      logSellerOrderNotification("error", "enrich: order not found", row.id);
      return buildSellerNotificationFallback(row);
    }

    return buildPayloadFromSellerOrder(row, sellerOrder);
  } catch (error) {
    logSellerOrderNotification(
      "error",
      "enrich failed",
      row.id,
      error instanceof Error ? error.message : String(error)
    );
    return buildSellerNotificationFallback(row);
  }
}

export async function enrichBuyerNotification(
  row: BuyerNotificationRow
): Promise<InAppNotificationPayload> {
  const { fetchBuyerOrderById } = await import("./ordersService");
  const buyerOrder = await fetchBuyerOrderById(row.order_id);
  if (!buyerOrder) {
    return buildFallbackPayload(row, "buyer");
  }

  return buildPayloadFromBuyerOrder(row, buyerOrder);
}

export function mapSellerNotificationRow(row: Record<string, unknown>): SellerNotificationRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    notification_type: String(row.notification_type),
    title: String(row.title),
    body: String(row.body),
    product_name: row.product_name ? String(row.product_name) : null,
    created_at: String(row.created_at),
  };
}

export function mapBuyerNotificationRow(row: Record<string, unknown>): BuyerNotificationRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    notification_type: String(row.notification_type),
    title: String(row.title),
    body: String(row.body),
    product_name: row.product_name ? String(row.product_name) : null,
    created_at: String(row.created_at),
  };
}

export function subscribeOrderNotificationInserts(
  userId: string,
  handlers: {
    onSellerInsert: (row: SellerNotificationRow) => void;
    onBuyerInsert: (row: BuyerNotificationRow) => void;
  }
): () => void {
  let disposed = false;
  let retryAttempt = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let channel = supabase.channel(`in-app-notifications-${userId}-${Date.now()}`);

  const MAX_RETRY_DELAY_MS = 30_000;

  const clearRetry = () => {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
  };

  const scheduleReconnect = () => {
    if (disposed) {
      return;
    }
    clearRetry();
    const delay = Math.min(1000 * 2 ** retryAttempt, MAX_RETRY_DELAY_MS);
    retryAttempt += 1;
    logSellerOrderNotification("realtime reconnect scheduled", `${delay}ms`);
    logBuyerNotification("realtime reconnect scheduled", `${delay}ms`);
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      if (!disposed) {
        connect();
      }
    }, delay);
  };

  const connect = () => {
    if (disposed) {
      return;
    }

    void supabase.removeChannel(channel);
    channel = supabase.channel(`in-app-notifications-${userId}-${Date.now()}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "seller_notifications",
          filter: `seller_id=eq.${userId}`,
        },
        (payload) => {
          const row = mapSellerNotificationRow(
            payload.new as Record<string, unknown>
          );
          if (row.notification_type !== "new_paid_order") {
            return;
          }
          logSellerOrderNotification(
            "realtime payload received",
            row.id,
            row.order_id
          );
          handlers.onSellerInsert(row);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "buyer_notifications",
          filter: `buyer_id=eq.${userId}`,
        },
        (payload) => {
          const row = mapBuyerNotificationRow(
            payload.new as Record<string, unknown>
          );
          if (row.notification_type !== "order_shipped") {
            return;
          }
          logBuyerShipmentToast(`realtime received ${row.id}`);
          logBuyerNotification(
            "realtime payload received",
            row.id,
            row.order_id
          );
          handlers.onBuyerInsert(row);
        }
      )
      .subscribe((status, err) => {
        logSellerOrderNotification(`subscription status ${status}`);
        logBuyerNotification(`subscription status ${status}`);
        if (err) {
          logSellerOrderNotification("error", "realtime channel", err.message);
          logBuyerNotification("error", "realtime channel", err.message);
          scheduleReconnect();
          return;
        }
        if (status === "SUBSCRIBED") {
          retryAttempt = 0;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logSellerOrderNotification("error", "realtime channel", status);
          logBuyerNotification("error", "realtime channel", status);
          scheduleReconnect();
        }
      });
  };

  connect();

  return () => {
    disposed = true;
    clearRetry();
    void supabase.removeChannel(channel);
  };
}

export function sellerNotificationRowFromService(
  notification: import("./sellerNotificationService").SellerNotification
): SellerNotificationRow {
  return {
    id: notification.id,
    order_id: notification.orderId,
    notification_type: notification.notificationType,
    title: notification.title,
    body: notification.body,
    product_name: notification.productName,
    created_at: notification.createdAt,
  };
}

export function buyerNotificationRowFromService(
  notification: import("./buyerNotificationService").BuyerNotification
): BuyerNotificationRow {
  return {
    id: notification.id,
    order_id: notification.orderId,
    notification_type: notification.notificationType,
    title: notification.title,
    body: notification.body,
    product_name: notification.productName,
    created_at: notification.createdAt,
  };
}
