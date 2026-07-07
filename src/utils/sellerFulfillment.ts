import type { Order } from "../types/order";
import type { SellerOrder } from "../types/order";

/** Eén bron van waarheid: betaald, nog niet verzonden, niet geannuleerd/terugbetaald. */
export function orderNeedsSellerAction(
  order: Order,
  options?: { fulfillmentStatus?: string | null }
): boolean {
  const fulfillmentStatus = options?.fulfillmentStatus ?? null;
  if (
    fulfillmentStatus === "stock_unavailable" ||
    fulfillmentStatus === "refund_pending" ||
    fulfillmentStatus === "manual_review" ||
    fulfillmentStatus === "refunded"
  ) {
    return false;
  }
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
  filter: SellerOrderFilter,
  options?: { fulfillmentStatus?: string | null }
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "action_required":
      return orderNeedsSellerAction(order, {
        fulfillmentStatus: options?.fulfillmentStatus ?? null,
      });
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
  orders: Array<SellerOrder & { fulfillment?: { fulfillmentStatus?: string | null } }>
): number {
  return orders.filter((row) =>
    orderNeedsSellerAction(row.order, {
      fulfillmentStatus: row.fulfillment?.fulfillmentStatus ?? null,
    })
  ).length;
}

function sellerOrderPriority(
  order: Order,
  fulfillmentStatus?: string | null
): number {
  if (orderNeedsSellerAction(order, { fulfillmentStatus })) {
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
export function sortSellerOrders<
  T extends SellerOrder & { fulfillment?: { fulfillmentStatus?: string | null } },
>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const priorityDiff =
      sellerOrderPriority(
        a.order,
        a.fulfillment?.fulfillmentStatus ?? null
      ) -
      sellerOrderPriority(
        b.order,
        b.fulfillment?.fulfillmentStatus ?? null
      );
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return (
      new Date(b.order.createdAt).getTime() -
      new Date(a.order.createdAt).getTime()
    );
  });
}

export function sellerFulfillmentLabel(
  order: Order,
  fulfillmentStatus?: string | null
): string {
  if (orderNeedsSellerAction(order, { fulfillmentStatus })) {
    return "Actie vereist";
  }
  if (
    fulfillmentStatus === "stock_unavailable" ||
    fulfillmentStatus === "refund_pending"
  ) {
    return "Terugbetaling bezig";
  }
  if (fulfillmentStatus === "manual_review") {
    return "Handmatige controle";
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

/** Hoofdgroepen voor verkoper-orderlijst — één bron van waarheid voor UI-secties. */
export type SellerOrderListBucket = "action_required" | "shipped" | "completed" | "other";

export const SELLER_ORDER_LIST_BUCKETS: SellerOrderListBucket[] = [
  "action_required",
  "shipped",
  "completed",
  "other",
];

export function resolveSellerOrderListBucket(
  order: Order,
  fulfillmentStatus?: string | null
): SellerOrderListBucket {
  if (orderNeedsSellerAction(order, { fulfillmentStatus })) {
    return "action_required";
  }
  if (order.shippingStatus === "shipped") {
    return "shipped";
  }
  if (order.shippingStatus === "delivered" || order.status === "completed") {
    return "completed";
  }
  return "other";
}

export function buildSellerOrderListSections<
  T extends SellerOrder & { fulfillment?: { fulfillmentStatus?: string | null } },
>(
  orders: T[],
  titles: Record<SellerOrderListBucket, string>
): Array<{ key: SellerOrderListBucket; title: string; data: T[] }> {
  const grouped: Record<SellerOrderListBucket, T[]> = {
    action_required: [],
    shipped: [],
    completed: [],
    other: [],
  };

  for (const row of orders) {
    const bucket = resolveSellerOrderListBucket(
      row.order,
      row.fulfillment?.fulfillmentStatus ?? null
    );
    grouped[bucket].push(row);
  }

  return SELLER_ORDER_LIST_BUCKETS.filter((key) => grouped[key].length > 0).map(
    (key) => ({
      key,
      title: titles[key],
      data: grouped[key],
    })
  );
}
