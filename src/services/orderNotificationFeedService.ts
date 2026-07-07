import { supabase } from "../lib/supabase";
import { fetchProductsByIds } from "./productsService";
import type { SellerNotification } from "./sellerNotificationService";
import { fetchSellerNotificationsForActivity } from "./sellerNotificationService";
import type { OrderRow } from "../types/order";
import { mapOrderRow } from "../types/order";
import { formatPriceEur } from "../utils/formatPrice";
import {
  sellerNotificationIsHandled,
  sellerNotificationNeedsAction,
} from "../utils/sellerNotificationStatus";

export type OrderNotificationItem = {
  notification: SellerNotification;
  title: string;
  subtitle: string;
  productThumbnailUrl: string | null;
  orderAmountLabel: string | null;
  buyerName: string | null;
  needsAction: boolean;
  isHandled: boolean;
  isUnread: boolean;
};

const ORDER_COLUMNS =
  "id, buyer_id, seller_id, status, subtotal_amount, platform_fee_amount, seller_amount, payment_status, buyer_email, buyer_full_name, shipping_country, shipping_city, shipping_postal_code, shipping_street, shipping_house_number, shipping_phone, seller_note, shipping_status, tracking_code, shipped_at, stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_at, fulfillment_status";

async function fetchOrdersByIds(
  orderIds: string[]
): Promise<Map<string, ReturnType<typeof mapOrderRow> & { fulfillmentStatus: string | null }>> {
  const unique = [...new Set(orderIds.filter(Boolean))];
  const map = new Map<
    string,
    ReturnType<typeof mapOrderRow> & { fulfillmentStatus: string | null }
  >();
  if (unique.length === 0) {
    return map;
  }

  const { data, error } = await supabase.from("orders").select(ORDER_COLUMNS).in("id", unique);

  if (error) {
    console.warn("[orderNotificationFeed] orders fetch failed", error.message);
    return map;
  }

  for (const row of (data ?? []) as (OrderRow & { fulfillment_status?: string | null })[]) {
    const order = mapOrderRow(row);
    map.set(row.id, {
      ...order,
      fulfillmentStatus: row.fulfillment_status ?? null,
    });
  }

  return map;
}

async function fetchFirstProductImageByOrderIds(
  orderIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (orderIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from("order_items")
    .select("order_id, product_id")
    .in("order_id", orderIds);

  if (error) {
    return map;
  }

  const productIds = [
    ...new Set(
      ((data ?? []) as { order_id: string; product_id: string }[])
        .map((r) => r.product_id)
        .filter(Boolean)
    ),
  ];
  const products = await fetchProductsByIds(productIds);
  const productImageMap = new Map(
    products.map((p) => [p.id, p.images[0] ?? null])
  );

  for (const row of (data ?? []) as { order_id: string; product_id: string }[]) {
    if (!map.has(row.order_id)) {
      map.set(row.order_id, productImageMap.get(row.product_id) ?? null);
    }
  }

  return map;
}

function buildOrderNotificationCopy(
  notification: SellerNotification,
  productName: string | null,
  amountLabel: string | null
): { title: string; subtitle: string } {
  const name = productName ?? notification.productName ?? "Product";
  const pricePart = amountLabel ? ` voor ${amountLabel}` : "";

  if (notification.notificationType === "order_refunded") {
    return {
      title: notification.title || "Bestelling terugbetaald",
      subtitle: notification.body || `${name} is terugbetaald.`,
    };
  }

  if (notification.handledAt) {
    return {
      title: "Bestelling afgehandeld",
      subtitle: `${name}${pricePart}`,
    };
  }

  return {
    title: notification.title || "Nieuwe bestelling ontvangen",
    subtitle:
      notification.body ||
      `${name} verkocht${pricePart}`.replace("verkocht voor", "verkocht voor"),
  };
}

export async function fetchOrderNotificationFeed(): Promise<OrderNotificationItem[]> {
  const notifications = await fetchSellerNotificationsForActivity(50);
  if (notifications.length === 0) {
    return [];
  }

  const orderIds = notifications.map((n) => n.orderId);
  const [orders, thumbnails] = await Promise.all([
    fetchOrdersByIds(orderIds),
    fetchFirstProductImageByOrderIds(orderIds),
  ]);

  return notifications.map((notification) => {
    const order = orders.get(notification.orderId) ?? null;
    const fulfillmentStatus = order?.fulfillmentStatus ?? null;
    const amountLabel =
      order?.sellerAmount != null ? formatPriceEur(order.sellerAmount) : null;
    const copy = buildOrderNotificationCopy(
      notification,
      notification.productName,
      amountLabel
    );

    return {
      notification,
      title: copy.title,
      subtitle: copy.subtitle,
      productThumbnailUrl: thumbnails.get(notification.orderId) ?? null,
      orderAmountLabel: amountLabel,
      buyerName: order?.buyerFullName ?? null,
      needsAction: sellerNotificationNeedsAction(notification, order, fulfillmentStatus),
      isHandled: sellerNotificationIsHandled(notification, order, fulfillmentStatus),
      isUnread: notification.readAt == null,
    };
  });
}

export function countUnreadOrderNotifications(items: OrderNotificationItem[]): number {
  return items.filter((item) => item.isUnread).length;
}
