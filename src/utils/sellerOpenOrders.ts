import type { SellerFulfillmentSnapshot } from "../services/sellerFulfillmentService";
import {
  countSellerOrdersNeedingAttention,
  orderNeedsSellerAction,
} from "./sellerFulfillment";
import type { SellerOrder } from "../types/order";

type SellerOrderRow = SellerOrder & {
  fulfillment?: { fulfillmentStatus?: string | null };
};

/** Eén bron: tel open seller-orders op basis van echte orderrijen. */
export function getOpenSellerOrderIdsFromRows(
  rows: SellerOrderRow[]
): string[] {
  return rows
    .filter((row) =>
      orderNeedsSellerAction(row.order, {
        fulfillmentStatus: row.fulfillment?.fulfillmentStatus ?? null,
      })
    )
    .map((row) => row.order.id);
}

export function getOpenSellerOrderCountFromRows(rows: SellerOrderRow[]): number {
  return countSellerOrdersNeedingAttention(rows);
}

export function getOpenSellerOrderIdsFromSnapshot(
  snapshot: SellerFulfillmentSnapshot
): string[] {
  return snapshot.ordersNeedingAction.map((row) => row.order.id);
}

export function getOpenSellerOrderCountFromSnapshot(
  snapshot: SellerFulfillmentSnapshot
): number {
  return getOpenSellerOrderIdsFromSnapshot(snapshot).length;
}
