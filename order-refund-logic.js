/**
 * Pure refund decision logic — shared by worker-stripe.js and unit tests.
 */

/** @typedef {'not_shipped' | 'shipped' | 'delivered' | string} ShippingStatus */

/**
 * @param {{ refunded?: boolean, amount_refunded?: number, amount?: number } | null | undefined} charge
 */
export function isFullChargeRefundSucceeded(charge) {
  if (!charge || charge.refunded !== true) {
    return false;
  }
  const amountRefunded = Number(charge.amount_refunded ?? 0);
  const amount = Number(charge.amount ?? 0);
  if (!Number.isFinite(amountRefunded) || !Number.isFinite(amount) || amount <= 0) {
    return false;
  }
  return amountRefunded >= amount;
}

/**
 * @param {{ status?: string } | null | undefined} refund
 */
export function isRefundUpdatedFailed(refund) {
  return String(refund?.status ?? "").toLowerCase() === "failed";
}

/**
 * @param {ShippingStatus | null | undefined} shippingStatus
 */
export function refundRequiresReturnForShippingStatus(shippingStatus) {
  const s = String(shippingStatus ?? "").toLowerCase();
  return s === "shipped" || s === "delivered";
}

/**
 * @param {ShippingStatus | null | undefined} shippingStatus
 */
export function shouldRestoreStockOnFullRefund(shippingStatus) {
  return String(shippingStatus ?? "").toLowerCase() === "not_shipped";
}

/**
 * @param {boolean} refundRequiresReturn
 */
export function buildRefundNotificationCopy(refundRequiresReturn) {
  if (refundRequiresReturn) {
    return {
      buyerTitle: "Bestelling terugbetaald",
      buyerBody:
        "Je bestelling is terugbetaald. Neem contact op met support als retourinstructies nodig zijn.",
      sellerTitle: "Bestelling terugbetaald",
      sellerBody:
        "De bestelling is terugbetaald. Het pakket staat al als verzonden; volg de retour-/supportinstructies.",
    };
  }
  return {
    buyerTitle: "Bestelling terugbetaald",
    buyerBody: "Je bestelling is terugbetaald.",
    sellerTitle: "Bestelling terugbetaald",
    sellerBody: "De bestelling is terugbetaald. Verzend dit pakket niet.",
  };
}

/**
 * @param {{ duplicate?: boolean, applied?: boolean } | null | undefined} rpcResult
 */
export function shouldSendRefundNotifications(rpcResult) {
  return rpcResult?.applied === true && rpcResult?.duplicate !== true;
}

/**
 * @param {string} message
 */
export function isRetriableRefundApplyError(message) {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("refund_stock_restore_failed") ||
    m.includes("postgrest 5") ||
    m.includes("internal server error")
  );
}

/**
 * In-memory simulator mirroring apply_full_order_refund transaction semantics (P1 tests).
 */
export function createRefundApplySimulator(initial = {}) {
  /** @type {Set<string>} */
  const processedEvents = new Set();
  /** @type {{ paymentStatus: string, status: string, shippingStatus: string, stockRestoredAt: string | null }} */
  const order = {
    paymentStatus: "paid",
    status: "paid",
    shippingStatus: "not_shipped",
    stockRestoredAt: null,
    ...initial.order,
  };
  let stock = initial.stock ?? 0;
  let notificationCount = 0;
  let stockRestoreShouldFail = false;
  let stockRestoreFailReason = "stock_not_committed";

  function applyFullRefund(stripeEventId, amountRefundedCents = 100) {
    if (processedEvents.has(stripeEventId)) {
      return { duplicate: true, applied: false };
    }
    if (order.paymentStatus === "refunded" || order.status === "refunded") {
      processedEvents.add(stripeEventId);
      return { duplicate: true, applied: false, reason: "already_refunded" };
    }
    if (order.paymentStatus !== "paid") {
      return { duplicate: false, applied: false, reason: "not_paid" };
    }
    const subtotalCents = 100;
    if (amountRefundedCents < subtotalCents) {
      return { duplicate: false, applied: false, reason: "not_full_refund" };
    }

    const requiresReturn =
      order.shippingStatus === "shipped" || order.shippingStatus === "delivered";

    if (!requiresReturn) {
      if (stockRestoreShouldFail) {
        throw new Error(`refund_stock_restore_failed:${stockRestoreFailReason}`);
      }
      stock += 1;
      order.stockRestoredAt = new Date().toISOString();
    }

    order.paymentStatus = "refunded";
    order.status = "refunded";
    processedEvents.add(stripeEventId);

    return {
      duplicate: false,
      applied: true,
      refund_requires_return: requiresReturn,
      stock_restored: !requiresReturn,
    };
  }

  function sendNotifications(rpcResult) {
    if (shouldSendRefundNotifications(rpcResult)) {
      notificationCount += 2;
    }
  }

  return {
    get order() {
      return order;
    },
    get stock() {
      return stock;
    },
    get notificationCount() {
      return notificationCount;
    },
    setStockRestoreFailure(shouldFail, reason = "stock_not_committed") {
      stockRestoreShouldFail = shouldFail;
      stockRestoreFailReason = reason;
    },
    hasProcessedEvent(id) {
      return processedEvents.has(id);
    },
    applyFullRefund,
    sendNotifications,
  };
}

/**
 * @param {string | null | undefined} paymentStatus
 */
export function canSellerMarkOrderShipped(paymentStatus) {
  return String(paymentStatus ?? "").toLowerCase() === "paid";
}
