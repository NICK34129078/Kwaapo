import {
  countSellerOrdersNeedingAttention,
  matchesSellerOrderFilter,
  orderNeedsSellerAction,
  sortSellerOrders,
} from "./sellerFulfillment";
import { formatSellerOrderBadgeCount } from "./sellerOrderBadge";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "paid",
    paymentStatus: "paid",
    shippingStatus: "not_shipped",
    subtotalAmount: 10,
    platformFeeAmount: 1,
    sellerAmount: 9,
    shippingStreet: "Test",
    shippingHouseNumber: "1",
    shippingPostalCode: "1234AB",
    shippingCity: "Amsterdam",
    shippingCountry: "NL",
    buyerFullName: "Koper",
    buyerEmail: "koper@test.nl",
    shippingPhone: null,
    sellerNote: null,
    trackingCode: null,
    shippedAt: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: "2026-01-01T12:00:00.000Z",
    createdAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  };
}

function makeSellerOrder(order: Order): SellerOrder {
  return { order, items: [], buyer: null };
}

export function runSellerFulfillmentTests(): void {
  const toShip = makeSellerOrder(makeOrder({ id: "a" }));
  const unpaid = makeSellerOrder(
    makeOrder({ id: "b", paymentStatus: "unpaid", shippingStatus: "not_shipped" })
  );
  const cancelled = makeSellerOrder(
    makeOrder({ id: "c", status: "cancelled", paymentStatus: "paid" })
  );
  const shipped = makeSellerOrder(
    makeOrder({
      id: "d",
      shippingStatus: "shipped",
      createdAt: "2026-01-02T12:00:00.000Z",
    })
  );

  assert(orderNeedsSellerAction(toShip.order), "paid not shipped needs action");
  assert(!orderNeedsSellerAction(unpaid.order), "unpaid excluded");
  assert(!orderNeedsSellerAction(cancelled.order), "cancelled excluded");
  const refunded = makeSellerOrder(
    makeOrder({ id: "e", paymentStatus: "refunded", status: "refunded" })
  );
  assert(!orderNeedsSellerAction(refunded.order), "refunded excluded");
  const stockUnavailable = makeSellerOrder(
    makeOrder({ id: "f", paymentStatus: "paid", shippingStatus: "not_shipped" })
  );
  assert(
    !orderNeedsSellerAction(stockUnavailable.order, {
      fulfillmentStatus: "stock_unavailable",
    }),
    "stock_unavailable excluded"
  );
  assert(countSellerOrdersNeedingAttention([toShip, unpaid, cancelled]) === 1, "count");
  assert(formatSellerOrderBadgeCount(0) === null, "badge zero");
  assert(formatSellerOrderBadgeCount(2) === "2", "badge two");
  assert(formatSellerOrderBadgeCount(10) === "9+", "badge cap");
  assert(matchesSellerOrderFilter(toShip.order, "action_required"), "filter");
  assert(!matchesSellerOrderFilter(unpaid.order, "action_required"), "unpaid filter");

  const sorted = sortSellerOrders([shipped, unpaid, toShip]);
  assert(sorted[0]?.order.id === "a", "sort action first");
}

if (require.main === module) {
  runSellerFulfillmentTests();
  console.log("sellerFulfillment.test.ts: ok");
}
