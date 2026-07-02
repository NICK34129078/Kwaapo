import { emitProductCatalogEvent } from "./productCatalogRefresh";
import {
  createStripeCheckoutSession,
  openStripeCheckoutAndConfirm,
} from "./stripeCheckoutService";

export type CheckoutPaymentResult =
  | { ok: true; orderId: string }
  | {
      ok: false;
      reason: "cancelled" | "failed" | "pending";
      message?: string;
      orderId: string;
    };

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

    if (payment.reason === "pending") {
      return {
        ok: false,
        reason: "pending",
        orderId,
        message:
          payment.message ??
          "Je betaling wordt nog verwerkt. Je kunt de status in je bestelling volgen.",
      };
    }

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
    throw e;
  }
}
