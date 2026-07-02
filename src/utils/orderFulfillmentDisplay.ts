export type FulfillmentStatus =
  | "committed"
  | "reconciled"
  | "stock_unavailable"
  | "refund_pending"
  | "refunded"
  | "manual_review";

export type OrderFulfillmentInfo = {
  fulfillmentStatus: FulfillmentStatus | null;
  paymentReconciledAt: string | null;
  fulfillmentExceptionAt: string | null;
  refundRequestedAt: string | null;
  refundCompletedAt: string | null;
};

const FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  "committed",
  "reconciled",
  "stock_unavailable",
  "refund_pending",
  "refunded",
  "manual_review",
];

export function isFulfillmentStatus(value: string): value is FulfillmentStatus {
  return (FULFILLMENT_STATUSES as string[]).includes(value);
}

export function mapOrderFulfillmentRow(row: {
  fulfillment_status?: string | null;
  payment_reconciled_at?: string | null;
  fulfillment_exception_at?: string | null;
  refund_requested_at?: string | null;
  refund_completed_at?: string | null;
}): OrderFulfillmentInfo {
  const raw = row.fulfillment_status;
  return {
    fulfillmentStatus:
      raw && isFulfillmentStatus(raw) ? raw : raw ? (raw as FulfillmentStatus) : null,
    paymentReconciledAt: row.payment_reconciled_at ?? null,
    fulfillmentExceptionAt: row.fulfillment_exception_at ?? null,
    refundRequestedAt: row.refund_requested_at ?? null,
    refundCompletedAt: row.refund_completed_at ?? null,
  };
}

export type OrderFulfillmentDisplay = {
  headline: string;
  detail: string;
  tone: "success" | "warning" | "info" | "error";
  showSupportHint: boolean;
};

export function getOrderFulfillmentDisplay(
  paymentStatus: string,
  fulfillment: OrderFulfillmentInfo | null | undefined,
  mode: "buyer" | "seller"
): OrderFulfillmentDisplay | null {
  const status = fulfillment?.fulfillmentStatus ?? null;

  if (paymentStatus === "refunded" || status === "refunded") {
    return {
      headline: "Terugbetaald",
      detail:
        mode === "buyer"
          ? "Je terugbetaling is verwerkt. Het bedrag wordt binnen enkele werkdagen teruggestort."
          : "Deze bestelling is terugbetaald. Verzend geen pakket meer.",
      tone: "info",
      showSupportHint: false,
    };
  }

  if (status === "stock_unavailable" || status === "refund_pending") {
    return {
      headline: "Betaling ontvangen — product niet meer beschikbaar",
      detail:
        mode === "buyer"
          ? "Je betaling is ontvangen, maar het product was helaas niet meer beschikbaar. Je terugbetaling wordt verwerkt."
          : "De koper heeft betaald, maar het product was niet meer op voorraad. Een automatische terugbetaling is gestart.",
      tone: "warning",
      showSupportHint: false,
    };
  }

  if (status === "manual_review") {
    return {
      headline: "Handmatige controle",
      detail:
        mode === "buyer"
          ? "Je betaling is ontvangen. We controleren je bestelling handmatig en nemen contact op over de terugbetaling."
          : "Deze bestelling vereist handmatige controle door support. Verzend nog geen pakket.",
      tone: "warning",
      showSupportHint: true,
    };
  }

  if (status === "reconciled" && paymentStatus === "paid") {
    return {
      headline: "Betaling bevestigd",
      detail:
        mode === "buyer"
          ? "Je betaling is succesvol verwerkt. De verkoper bereidt je bestelling voor."
          : "Betaling ontvangen (hersteld na verlopen checkout). Maak het pakket klaar voor verzending.",
      tone: "success",
      showSupportHint: false,
    };
  }

  if (paymentStatus === "paid" && status === "committed") {
    return null;
  }

  if (paymentStatus === "paid" && !status) {
    return null;
  }

  return null;
}

export function fulfillmentBlocksSellerShip(
  fulfillment: OrderFulfillmentInfo | null | undefined
): boolean {
  const status = fulfillment?.fulfillmentStatus;
  return (
    status === "stock_unavailable" ||
    status === "refund_pending" ||
    status === "refunded" ||
    status === "manual_review"
  );
}

export function buyerPaymentHeadline(
  paymentStatus: string,
  fulfillment: OrderFulfillmentInfo | null | undefined
): string | null {
  if (paymentStatus === "paid" && fulfillment?.fulfillmentStatus === "stock_unavailable") {
    return "Betaald — terugbetaling wordt verwerkt";
  }
  if (paymentStatus === "paid" && fulfillment?.fulfillmentStatus === "refund_pending") {
    return "Betaald — terugbetaling onderweg";
  }
  if (paymentStatus === "paid" && fulfillment?.fulfillmentStatus === "manual_review") {
    return "Betaald — in behandeling";
  }
  if (paymentStatus === "paid" && fulfillment?.fulfillmentStatus === "reconciled") {
    return "Betaald";
  }
  return null;
}
