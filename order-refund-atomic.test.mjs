/**
 * P1 atomic refund flow — retry after stock-restore failure.
 * Run: node order-refund-atomic.test.mjs
 */
import {
  createRefundApplySimulator,
  isRetriableRefundApplyError,
  shouldSendRefundNotifications,
} from "./order-refund-logic.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runP1AtomicRefundRetryTest() {
  const sim = createRefundApplySimulator({ stock: 0 });

  // Attempt 1: stock restore fails → full rollback semantics (no processed event)
  sim.setStockRestoreFailure(true, "stock_not_committed");
  let threw = false;
  try {
    sim.applyFullRefund("evt_refund_001");
  } catch (e) {
    threw = true;
    assert(
      isRetriableRefundApplyError(e instanceof Error ? e.message : String(e)),
      "retriable error for Stripe retry"
    );
  }
  assert(threw, "first attempt throws on stock restore failure");
  assert(sim.order.paymentStatus === "paid", "order stays paid after failed attempt");
  assert(sim.order.status === "paid", "order status stays paid");
  assert(!sim.hasProcessedEvent("evt_refund_001"), "event not marked processed");
  assert(sim.stock === 0, "stock unchanged after failed restore");
  sim.sendNotifications({ applied: false });
  assert(sim.notificationCount === 0, "no notifications after failure");

  // Attempt 2: retry succeeds
  sim.setStockRestoreFailure(false);
  const second = sim.applyFullRefund("evt_refund_001");
  assert(second.applied === true, "retry applies refund");
  assert(sim.order.paymentStatus === "refunded", "order refunded after retry");
  assert(sim.hasProcessedEvent("evt_refund_001"), "event processed once");
  assert(sim.stock === 1, "stock restored exactly once");
  assert(sim.order.stockRestoredAt !== null, "stock_restored_at equivalent set");

  sim.sendNotifications(second);
  assert(sim.notificationCount === 2, "one buyer + one seller notification");

  // Attempt 3: duplicate webhook
  const third = sim.applyFullRefund("evt_refund_001");
  assert(third.duplicate === true, "duplicate event blocked");
  assert(sim.stock === 1, "no double stock restore");
  const notifsBefore = sim.notificationCount;
  sim.sendNotifications(third);
  assert(sim.notificationCount === notifsBefore, "no duplicate notifications");
}

function runShippedRefundNoStockTest() {
  const sim = createRefundApplySimulator({
    stock: 0,
    order: { shippingStatus: "shipped" },
  });
  const result = sim.applyFullRefund("evt_shipped_refund");
  assert(result.applied === true, "shipped refund applies");
  assert(result.refund_requires_return === true, "refund_requires_return");
  assert(result.stock_restored === false, "no stock restore when shipped");
  assert(sim.stock === 0, "stock unchanged");
  assert(sim.hasProcessedEvent("evt_shipped_refund"), "event processed for shipped path");
}

function run() {
  runP1AtomicRefundRetryTest();
  runShippedRefundNoStockTest();
  console.log("order-refund-atomic.test.mjs: ok (P1 retry + shipped path)");
}

run();
