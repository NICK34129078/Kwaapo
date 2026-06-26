import { emitProductCatalogEvent } from "./productCatalogRefresh";
import {
  createStripeCheckoutSession,
  openStripeCheckoutAndConfirm,
  releaseCheckoutStockReservation,
} from "./stripeCheckoutService";

export type CheckoutPaymentResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: "cancelled" | "failed"; message?: string; orderId: string };

/**
 * Start of hervat Stripe Hosted Checkout voor een bestaande unpaid order.
 */
export async function payOrderWithStripe(orderId: string): Promise<CheckoutPaymentResult> {
  try {
    const { checkoutUrl, sessionId } = await createStripeCheckoutSession(orderId);
    const payment = await openStripeCheckoutAndConfirm(checkoutUrl, orderId, sessionId);

    if (payment.ok) {
      emitProductCatalogEvent({ kind: "refresh" });
      return { ok: true, orderId: payment.order.id };
    }

    await releaseCheckoutStockReservation(orderId);
    emitProductCatalogEvent({ kind: "refresh" });

    if (payment.reason === "cancelled") {
      return { ok: false, reason: "cancelled", orderId };
    }
    return {
      ok: false,
      reason: "failed",
      orderId,
      message: payment.message,
    };
  } catch (e) {
    await releaseCheckoutStockReservation(orderId);
    emitProductCatalogEvent({ kind: "refresh" });
    throw e;
  }
}
