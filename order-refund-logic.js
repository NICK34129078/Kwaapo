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
 * @param {string | null | undefined} paymentStatus
 */
export function canSellerMarkOrderShipped(paymentStatus) {
  return String(paymentStatus ?? "").toLowerCase() === "paid";
}
