/**
 * Node entrypoint for late checkout payment reconciliation tests.
 * Run: node checkout-late-payment-reconciliation.test.mjs
 */
import {
  createLatePaymentReconciliationSimulator,
  reconcileOutcome,
  shouldAttemptStockReconcile,
  shouldAttemptStockRecoveryForPaidOrder,
  shouldInitiateAutoRefund,
  shouldNotifySellerOnPaid,
} from "./order-reconciliation-logic.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  // 1. Normal completed while stock reserved
  {
    const sim = createLatePaymentReconciliationSimulator({
      order: { stockReleasedAt: null, stockReservedAt: "2026-01-01T00:00:00Z" },
      productStock: 5,
    });
    const result = sim.handleCompletedWebhook();
    assert(result.outcome === "paid_committed", "1: paid_committed");
    assert(sim.order.paymentStatus === "paid", "1: payment paid");
    assert(sim.order.fulfillmentStatus === "committed", "1: committed");
    assert(sim.productStock === 5, "1: stock not decremented on commit path in sim");
    assert(sim.sellerNotifications === 1, "1: seller notified");
    assert(sim.refundInitiations === 0, "1: no refund");
  }

  // 2. Expired then completed, stock still available
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 3 });
    sim.handleExpiredWebhook();
    assert(sim.productStock === 4, "2: stock released once");
    sim.handleExpiredWebhook();
    assert(sim.productStock === 4, "2: duplicate expired no double release");
    const result = sim.handleCompletedWebhook();
    assert(result.outcome === "paid_reconciled", "2: reconciled");
    assert(sim.order.fulfillmentStatus === "reconciled", "2: fulfillment reconciled");
    assert(sim.productStock === 3, "2: stock decremented once");
    assert(sim.sellerNotifications === 1, "2: seller notified");
    assert(sim.refundInitiations === 0, "2: no refund");
  }

  // 3. Expired then completed, stock gone
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 0 });
    sim.handleExpiredWebhook();
    sim.setProductStock(0);
    const result = sim.handleCompletedWebhook();
    assert(result.outcome === "paid_refund_started", "3: refund started");
    assert(sim.order.paymentStatus === "paid", "3: payment registered");
    assert(sim.order.fulfillmentStatus === "refund_pending", "3: refund pending");
    assert(sim.refundInitiations === 1, "3: refund once");
    assert(sim.productStock === 0, "3: stock not oversold");
    assert(sim.sellerNotifications === 0, "3: seller not notified");
  }

  // 4. Duplicate completed webhook
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 2 });
    sim.handleExpiredWebhook();
    sim.handleCompletedWebhook();
    const stockAfterFirst = sim.productStock;
    sim.handleCompletedWebhook();
    assert(sim.productStock === stockAfterFirst, "4: no double stock decrement");
    assert(sim.refundInitiations === 0, "4: no refund");
    assert(sim.sellerNotifications === 1, "4: seller notified once");
  }

  // 5. Duplicate expired webhook
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 2 });
    const first = sim.handleExpiredWebhook();
    assert(first.released === true, "5: first release");
    const second = sim.handleExpiredWebhook();
    assert(second.duplicate === true, "5: duplicate expired");
    assert(sim.productStock === 3, "5: stock released once");
  }

  // 6. Late completed after auto-refund already started
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 0 });
    sim.handleExpiredWebhook();
    sim.setProductStock(0);
    sim.handleCompletedWebhook();
    assert(sim.order.fulfillmentStatus === "refund_pending", "6: refund pending");
    const refundsBefore = sim.refundInitiations;
    sim.handleCompletedWebhook();
    assert(sim.refundInitiations === refundsBefore, "6: no double refund");
    assert(sim.order.paymentStatus === "paid", "6: stays paid");
  }

  // 7. Product variant stock
  {
    const sim = createLatePaymentReconciliationSimulator({
      useVariants: true,
      variantId: "size-m",
      variantStock: { "size-m": 0, "size-l": 5 },
      productStock: 99,
    });
    sim.handleExpiredWebhook();
    assert(sim.variantStock["size-m"] === 1, "7: variant m released");
    assert(sim.variantStock["size-l"] === 5, "7: variant l unchanged");
    sim.setVariantStock("size-m", 0);
    const result = sim.handleCompletedWebhook();
    assert(result.outcome === "paid_refund_started", "7: out of stock for variant");
    assert(sim.variantStock["size-l"] === 5, "7: variant l still unchanged");
  }

  // 8. Worker refund failure → manual review
  {
    const sim = createLatePaymentReconciliationSimulator({ productStock: 0 });
    sim.handleExpiredWebhook();
    sim.setProductStock(0);
    sim.handleCompletedWebhook();
    sim.failRefund();
    assert(sim.order.fulfillmentStatus === "manual_review", "8: manual review");
    assert(sim.order.paymentStatus === "paid", "8: payment still recorded");
  }

  // Pure helpers
  assert(
    shouldAttemptStockReconcile({
      stockCommittedAt: null,
      stockReleasedAt: "2026-01-01",
    }),
    "helper: should reconcile"
  );
  assert(
    !shouldAttemptStockReconcile({
      stockCommittedAt: "2026-01-01",
      stockReleasedAt: "2026-01-02",
    }),
    "helper: already committed"
  );
  assert(
    reconcileOutcome({ ok: true, reason: "reconciled" }) === "reconciled",
    "helper: reconcile outcome"
  );
  assert(
    shouldAttemptStockRecoveryForPaidOrder({
      stockCommittedAt: null,
      stockReleasedAt: null,
      stockReservedAt: null,
    }),
    "helper: recover when never reserved"
  );
  assert(
    reconcileOutcome({ ok: false, reason: "active_reservation" }) ===
      "active_reservation",
    "helper: active_reservation outcome"
  );
  assert(shouldNotifySellerOnPaid("reconciled"), "helper: notify seller reconciled");
  assert(
    !shouldInitiateAutoRefund({
      paymentStatus: "paid",
      refundRequestedAt: "2026-01-01",
      fulfillmentStatus: "stock_unavailable",
    }),
    "helper: no double refund"
  );

  console.log("checkout-late-payment-reconciliation.test.mjs: ok (8 scenarios)");
}

run();
