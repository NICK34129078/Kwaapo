/**
 * Pure checkout late-payment reconciliation logic — shared by worker-stripe.js and tests.
 */

/** @typedef {'committed'|'reconciled'|'stock_unavailable'|'refund_pending'|'refunded'|'manual_review'|null} FulfillmentStatus */

/**
 * @param {{ stockCommittedAt?: string|null, stockReleasedAt?: string|null, stockReservedAt?: string|null }} order
 */
export function shouldAttemptStockReconcile(order) {
  if (order.stockCommittedAt) {
    return false;
  }
  return order.stockReleasedAt != null;
}

/**
 * @param {{ ok?: boolean, reason?: string } | null | undefined} reconcileResult
 */
export function reconcileOutcome(reconcileResult) {
  const reason = String(reconcileResult?.reason ?? "");
  if (reconcileResult?.ok === true && reason === "already_committed") {
    return "already_committed";
  }
  if (reconcileResult?.ok === true && reason === "reconciled") {
    return "reconciled";
  }
  if (reason === "stock_unavailable" || reconcileResult?.ok === false) {
    return "stock_unavailable";
  }
  return "unknown";
}

/**
 * @param {FulfillmentStatus | string | null | undefined} status
 */
export function shouldNotifySellerOnPaid(status) {
  const s = String(status ?? "");
  return s === "committed" || s === "reconciled";
}

/**
 * @param {{ paymentStatus?: string, refundRequestedAt?: string|null, fulfillmentStatus?: string|null }} order
 */
export function shouldInitiateAutoRefund(order) {
  if (order.paymentStatus === "refunded") {
    return false;
  }
  if (order.refundRequestedAt) {
    return false;
  }
  if (order.fulfillmentStatus === "refund_pending" || order.fulfillmentStatus === "refunded") {
    return false;
  }
  return order.fulfillmentStatus === "stock_unavailable";
}

/**
 * In-memory simulator for late-payment webhook scenarios.
 */
export function createLatePaymentReconciliationSimulator(initial = {}) {
  /** @type {{ paymentStatus: string, status: string, stockReservedAt: string|null, stockReleasedAt: string|null, stockCommittedAt: string|null, fulfillmentStatus: string|null, refundRequestedAt: string|null, refundCompletedAt: string|null, paymentReconciledAt: string|null }} */
  const order = {
    paymentStatus: "unpaid",
    status: "pending_payment",
    stockReservedAt: "2026-01-01T00:00:00Z",
    stockReleasedAt: null,
    stockCommittedAt: null,
    fulfillmentStatus: null,
    refundRequestedAt: null,
    refundCompletedAt: null,
    paymentReconciledAt: null,
    ...initial.order,
  };

  let productStock = initial.productStock ?? 5;
  /** @type {Record<string, number>} */
  const variantStock = { ...(initial.variantStock ?? {}) };
  const useVariants = initial.useVariants === true;
  const variantId = initial.variantId ?? "variant-1";
  const quantity = initial.quantity ?? 1;
  let refundInitiations = 0;
  let sellerNotifications = 0;
  let completedWebhookCount = 0;
  let expiredWebhookCount = 0;

  function releaseStock() {
    if (order.stockReleasedAt) {
      return { released: false, duplicate: true };
    }
    if (order.stockCommittedAt) {
      return { released: false, reason: "committed" };
    }
    if (useVariants) {
      variantStock[variantId] = (variantStock[variantId] ?? 0) + quantity;
    } else {
      productStock += quantity;
    }
    order.stockReleasedAt = new Date().toISOString();
    return { released: true };
  }

  function commitStock() {
    if (order.stockCommittedAt) {
      return { ok: true, reason: "already_committed" };
    }
    if (order.stockReleasedAt) {
      return { ok: false, reason: "released" };
    }
    if (!order.stockReservedAt) {
      return { ok: false, reason: "not_reserved" };
    }
    order.stockCommittedAt = new Date().toISOString();
    order.fulfillmentStatus = "committed";
    return { ok: true, reason: "committed" };
  }

  function reconcileStock() {
    if (order.stockCommittedAt) {
      return { ok: true, reason: "already_committed" };
    }
    const available = useVariants
      ? (variantStock[variantId] ?? 0)
      : productStock;
    if (available < quantity) {
      return { ok: false, reason: "stock_unavailable" };
    }
    if (useVariants) {
      variantStock[variantId] -= quantity;
    } else {
      productStock -= quantity;
    }
    order.stockReservedAt = order.stockReservedAt ?? new Date().toISOString();
    order.stockReleasedAt = null;
    order.stockCommittedAt = new Date().toISOString();
    return { ok: true, reason: "reconciled" };
  }

  function markPaid(fulfillmentStatus) {
    order.paymentStatus = "paid";
    order.status = "paid";
    order.fulfillmentStatus = fulfillmentStatus;
    if (fulfillmentStatus === "reconciled") {
      order.paymentReconciledAt = new Date().toISOString();
    }
    if (fulfillmentStatus === "stock_unavailable") {
      order.fulfillmentExceptionAt = new Date().toISOString();
    }
  }

  function handleCompletedWebhook() {
    completedWebhookCount += 1;
    if (order.paymentStatus === "paid") {
      if (shouldInitiateAutoRefund(order)) {
        initiateRefund();
      }
      return { outcome: "duplicate_completed", order: { ...order } };
    }

    const committed = commitStock();
    if (committed.ok && committed.reason === "committed") {
      markPaid("committed");
      sellerNotifications += 1;
      return { outcome: "paid_committed", order: { ...order } };
    }

    const reconcile = reconcileStock();
    const outcome = reconcileOutcome(reconcile);
    if (outcome === "reconciled" || outcome === "already_committed") {
      markPaid(outcome === "reconciled" ? "reconciled" : "committed");
      sellerNotifications += 1;
      return { outcome: "paid_reconciled", order: { ...order } };
    }

    markPaid("stock_unavailable");
    initiateRefund();
    return { outcome: "paid_refund_started", order: { ...order } };
  }

  function handleExpiredWebhook() {
    expiredWebhookCount += 1;
    return releaseStock();
  }

  function setProductStock(value) {
    productStock = value;
  }

  function setVariantStock(variantKey, value) {
    variantStock[variantKey] = value;
  }

  function initiateRefund() {
    if (!shouldInitiateAutoRefund(order) && order.fulfillmentStatus !== "stock_unavailable") {
      return { skipped: true };
    }
    if (order.refundRequestedAt) {
      return { skipped: true, duplicate: true };
    }
    refundInitiations += 1;
    order.refundRequestedAt = new Date().toISOString();
    order.fulfillmentStatus = "refund_pending";
    return { ok: true };
  }

  function applyRefundWebhook() {
    if (order.paymentStatus === "refunded") {
      return { duplicate: true };
    }
    order.paymentStatus = "refunded";
    order.status = "refunded";
    order.fulfillmentStatus = "refunded";
    order.refundCompletedAt = new Date().toISOString();
    if (order.stockCommittedAt && !order.stockRestoredAt) {
      if (useVariants) {
        variantStock[variantId] = (variantStock[variantId] ?? 0) + quantity;
      } else {
        productStock += quantity;
      }
      order.stockRestoredAt = new Date().toISOString();
    }
    return { applied: true };
  }

  return {
    order,
    get productStock() {
      return productStock;
    },
    get variantStock() {
      return { ...variantStock };
    },
    get refundInitiations() {
      return refundInitiations;
    },
    get sellerNotifications() {
      return sellerNotifications;
    },
    get completedWebhookCount() {
      return completedWebhookCount;
    },
    handleCompletedWebhook,
    handleExpiredWebhook,
    initiateRefund,
    applyRefundWebhook,
    setProductStock,
    setVariantStock,
    failRefund() {
      order.fulfillmentStatus = "manual_review";
      return order;
    },
  };
}
