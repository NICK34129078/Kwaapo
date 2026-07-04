import { supabase } from "../lib/supabase";
import { formatPriceEur } from "../utils/formatPrice";
import {
  formatOrderItemSizeLabel,
} from "../utils/orderDashboard";
import {
  NOTIFICATION_SUBTITLES,
  notificationOrderReference,
  type InAppNotificationAudience,
  type InAppNotificationPayload,
} from "../utils/inAppNotification";
import type { BuyerOrder } from "../types/order";
import type { SellerOrderListRow } from "./ordersService";

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

function buildPayloadFromSellerOrder(
  row: SellerNotificationRow,
  sellerOrder: SellerOrderListRow
): InAppNotificationPayload {
  const firstItem = sellerOrder.items[0];
  const order = sellerOrder.order;
  const variantLabel = formatOrderItemSizeLabel(firstItem);

  return {
    id: row.id,
    orderId: row.order_id,
    audience: "seller",
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    subtitle: NOTIFICATION_SUBTITLES[row.notification_type] ?? null,
    productImageUrl: firstProductImage(sellerOrder.items),
    productName: row.product_name ?? firstItem?.product?.name ?? null,
    variantLabel,
    amountLabel: formatPriceEur(order.subtotalAmount),
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
  const hasTracking = Boolean(order.trackingCode?.trim());
  const subtitle =
    row.notification_type === "order_shipped" && hasTracking
      ? NOTIFICATION_SUBTITLES.order_shipped
      : NOTIFICATION_SUBTITLES[row.notification_type] ?? null;

  return {
    id: row.id,
    orderId: row.order_id,
    audience: "buyer",
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    subtitle,
    productImageUrl: firstProductImage(buyerOrder.items),
    productName: row.product_name ?? firstItem?.product?.name ?? null,
    variantLabel,
    amountLabel: formatPriceEur(order.subtotalAmount),
    orderReference: notificationOrderReference(order.id),
    createdAt: row.created_at,
  };
}

function buildFallbackPayload(
  row: SellerNotificationRow | BuyerNotificationRow,
  audience: InAppNotificationAudience
): InAppNotificationPayload {
  return {
    id: row.id,
    orderId: row.order_id,
    audience,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    subtitle: NOTIFICATION_SUBTITLES[row.notification_type] ?? null,
    productImageUrl: null,
    productName: row.product_name,
    variantLabel: null,
    amountLabel: null,
    orderReference: notificationOrderReference(row.order_id),
    createdAt: row.created_at,
  };
}

export async function enrichSellerNotification(
  row: SellerNotificationRow
): Promise<InAppNotificationPayload> {
  const { fetchSellerOrderById } = await import("./ordersService");
  const sellerOrder = await fetchSellerOrderById(row.order_id);
  if (!sellerOrder) {
    return buildFallbackPayload(row, "seller");
  }

  return buildPayloadFromSellerOrder(row, sellerOrder);
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
  const channel = supabase
    .channel(`in-app-notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "seller_notifications",
        filter: `seller_id=eq.${userId}`,
      },
      (payload) => {
        handlers.onSellerInsert(mapSellerNotificationRow(payload.new as Record<string, unknown>));
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
        handlers.onBuyerInsert(mapBuyerNotificationRow(payload.new as Record<string, unknown>));
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
