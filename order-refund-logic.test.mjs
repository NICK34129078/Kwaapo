/**
 * Node entrypoint for refund logic unit tests (8 testmatrix scenarios).
 * Run: node order-refund-logic.test.mjs
 */
import {
  buildRefundNotificationCopy,
  canSellerMarkOrderShipped,
  isFullChargeRefundSucceeded,
  isRefundUpdatedFailed,
  refundRequiresReturnForShippingStatus,
  shouldRestoreStockOnFullRefund,
  shouldSendRefundNotifications,
} from "./order-refund-logic.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  // 1 pre-ship
  assert(shouldRestoreStockOnFullRefund("not_shipped"));
  assert(!refundRequiresReturnForShippingStatus("not_shipped"));
  assert(buildRefundNotificationCopy(false).sellerBody.includes("Verzend dit pakket niet"));

  // 2 post-ship
  assert(!shouldRestoreStockOnFullRefund("shipped"));
  assert(refundRequiresReturnForShippingStatus("shipped"));
  assert(buildRefundNotificationCopy(true).buyerBody.includes("support"));

  // 3 duplicate
  assert(!shouldSendRefundNotifications({ duplicate: true }));

  // 4 pending
  assert(!isFullChargeRefundSucceeded({ refunded: false, amount: 100, amount_refunded: 0 }));

  // 5 failed
  assert(isRefundUpdatedFailed({ status: "failed" }));
  assert(!shouldSendRefundNotifications({ applied: false }));

  // 6 dashboard (same webhook gate as API)
  assert(isFullChargeRefundSucceeded({ refunded: true, amount: 100, amount_refunded: 100 }));

  // 7 API full refund succeeded
  assert(isFullChargeRefundSucceeded({ refunded: true, amount: 2000, amount_refunded: 2000 }));

  // 8 stock paths
  assert(shouldRestoreStockOnFullRefund("not_shipped"));
  assert(!shouldRestoreStockOnFullRefund("shipped"));
  assert(!canSellerMarkOrderShipped("refunded"));

  console.log("order-refund-logic.test.mjs: ok (8 scenarios)");
}

run();
