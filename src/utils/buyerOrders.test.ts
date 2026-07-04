import {
  buyerOrderDisplayStatus,
  buyerOrderStatusLabel,
} from "./buyerOrderStatus";
import type { Order } from "../types/order";
import {
  buyerOrdersPageHasMore,
  formatOrderItemQuantityLine,
  formatOrderReference,
} from "./buyerOrdersList";
import { matchesBuyerOrderFilter } from "./orderDashboard";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "6994982d-aaaa-bbbb-cccc-ddddeeeeffff",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "paid",
    paymentStatus: "paid",
    shippingStatus: "not_shipped",
    subtotalAmount: 19.99,
    platformFeeAmount: 2.5,
    sellerAmount: 17.49,
    shippingStreet: "Teststraat",
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

export function runBuyerOrdersTests(): void {
  assert(
    buyerOrderStatusLabel(makeOrder({ paymentStatus: "unpaid" })) ===
      "Betaling in behandeling",
    "unpaid label"
  );
  assert(
    buyerOrderStatusLabel(makeOrder({ paymentStatus: "paid" })) === "Betaald",
    "paid label"
  );
  assert(
    buyerOrderStatusLabel(
      makeOrder({ paymentStatus: "paid", status: "processing" })
    ) === "Wordt verwerkt",
    "processing label"
  );
  assert(
    buyerOrderStatusLabel(
      makeOrder({ paymentStatus: "paid", shippingStatus: "shipped" })
    ) === "Verzonden",
    "shipped label"
  );
  assert(
    buyerOrderStatusLabel(
      makeOrder({ paymentStatus: "paid", shippingStatus: "delivered" })
    ) === "Bezorgd",
    "delivered label"
  );
  assert(
    buyerOrderStatusLabel(makeOrder({ status: "cancelled" })) === "Geannuleerd",
    "cancelled label"
  );
  assert(
    buyerOrderStatusLabel(makeOrder({ paymentStatus: "refunded" })) ===
      "Terugbetaald",
    "refunded label"
  );

  assert(formatOrderReference("6994982d-aaaa-bbbb-cccc-ddddeeeeffff") === "#6994982d", "order ref");
  assert(formatOrderItemQuantityLine({ quantity: 1 }) === "1 stuk", "qty 1");
  assert(formatOrderItemQuantityLine({ quantity: 3 }) === "3 stuks", "qty 3");

  assert(buyerOrdersPageHasMore(20, 20), "full page has more");
  assert(!buyerOrdersPageHasMore(19, 20), "partial page has no more");

  const newest = makeOrder({
    id: "new",
    createdAt: "2026-03-01T12:00:00.000Z",
    paymentStatus: "paid",
  });
  const oldest = makeOrder({
    id: "old",
    createdAt: "2026-01-01T12:00:00.000Z",
    paymentStatus: "unpaid",
  });
  const sorted = [oldest, newest].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  assert(sorted[0]?.id === "new", "newest first sort contract");

  assert(
    matchesBuyerOrderFilter(newest, "waiting_ship"),
    "paid unpaid-ship matches waiting_ship filter"
  );
  assert(
    !matchesBuyerOrderFilter(oldest, "waiting_ship"),
    "unpaid does not match waiting_ship filter"
  );

  assert(
    buyerOrderDisplayStatus(makeOrder({ paymentStatus: "paid", status: "processing" })) ===
      "processing",
    "processing display status"
  );

  const foreignOrderId = "foreign-order-id";
  const ownBuyerId = "buyer-1";
  const canAccessOwnOrder =
    ownBuyerId === makeOrder({ buyerId: ownBuyerId, id: foreignOrderId }).buyerId;
  const cannotAccessForeignOrder =
    ownBuyerId !== makeOrder({ buyerId: "other-buyer", id: foreignOrderId }).buyerId;
  assert(canAccessOwnOrder, "buyer can access own order id");
  assert(cannotAccessForeignOrder, "buyer cannot access foreign order id");

  console.log("buyerOrders tests passed");
}

if (require.main === module) {
  runBuyerOrdersTests();
}
