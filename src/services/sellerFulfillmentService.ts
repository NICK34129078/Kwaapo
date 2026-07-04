import { supabase } from "../lib/supabase";
import { fetchProfileById } from "./profileService";
import { fetchSellerOrders, type SellerOrderListRow } from "./ordersService";
import type { SellerOrder } from "../types/order";
import {
  countSellerOrdersNeedingAttention,
  orderNeedsSellerAction,
  sortSellerOrders,
} from "../utils/sellerFulfillment";

async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user?.id) {
    return null;
  }
  return user.id;
}

/** Server-side count — zelfde logica als client selectors. */
export async function countSellerOrdersNeedingActionForCurrentUser(): Promise<number> {
  const sellerId = await getCurrentUserId();
  if (!sellerId) {
    return 0;
  }

  const profile = await fetchProfileById(sellerId);
  if (profile?.accountType !== "business") {
    return 0;
  }

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId)
    .eq("payment_status", "paid")
    .eq("shipping_status", "not_shipped")
    .neq("status", "cancelled")
    .neq("status", "refunded")
    .or(
      "fulfillment_status.is.null,fulfillment_status.eq.committed,fulfillment_status.eq.reconciled"
    );

  if (error) {
    console.warn("[sellerFulfillmentService] count failed", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchSellerOrdersNeedingAction(): Promise<SellerOrderListRow[]> {
  const rows = await fetchSellerOrders();
  return sortSellerOrders(
    rows.filter((row) =>
      orderNeedsSellerAction(row.order, {
        fulfillmentStatus: row.fulfillment.fulfillmentStatus,
      })
    )
  );
}

export type SellerFulfillmentSnapshot = {
  actionCount: number;
  ordersNeedingAction: SellerOrderListRow[];
  isBusinessSeller: boolean;
};

export async function fetchSellerFulfillmentSnapshot(): Promise<SellerFulfillmentSnapshot> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return { actionCount: 0, ordersNeedingAction: [], isBusinessSeller: false };
  }

  const profile = await fetchProfileById(userId);
  if (profile?.accountType !== "business") {
    return { actionCount: 0, ordersNeedingAction: [], isBusinessSeller: false };
  }

  const allOrders = await fetchSellerOrders();
  const ordersNeedingAction = sortSellerOrders(
    allOrders.filter((row) =>
      orderNeedsSellerAction(row.order, {
        fulfillmentStatus: row.fulfillment.fulfillmentStatus,
      })
    )
  );

  return {
    actionCount: countSellerOrdersNeedingAttention(allOrders),
    ordersNeedingAction,
    isBusinessSeller: true,
  };
}

export type SellerFulfillmentChangeHint = {
  orderId?: string;
  source: "orders";
  becameShipped?: boolean;
};

export function subscribeSellerFulfillmentChanges(
  sellerId: string,
  onChange: (hint?: SellerFulfillmentChangeHint) => void
): () => void {
  const channel = supabase
    .channel(`seller-fulfillment-${sellerId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `seller_id=eq.${sellerId}`,
      },
      (payload) => {
        const newRow = (payload.new ?? {}) as Record<string, unknown>;
        const oldRow = (payload.old ?? {}) as Record<string, unknown>;
        const orderId = newRow.id ? String(newRow.id) : undefined;
        const becamePaid =
          newRow.payment_status === "paid" && oldRow.payment_status !== "paid";
        const stillNeedsShip =
          newRow.shipping_status === "not_shipped" ||
          newRow.shipping_status == null ||
          newRow.shipping_status === undefined;
        const becameShipped =
          (newRow.shipping_status === "shipped" ||
            newRow.shipping_status === "delivered") &&
          oldRow.shipping_status !== "shipped" &&
          oldRow.shipping_status !== "delivered";

        if (becamePaid && stillNeedsShip) {
          return;
        }

        onChange({
          orderId,
          source: "orders",
          becameShipped,
        });
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

/**
 * Handmatige test-checklist (seller fulfillment):
 * 1. Unpaid order → geen actie-badge, geen notification.
 * 2. Stripe paid → 1 notification, badge + kaart, bovenaan actie-lijst.
 * 3. Order openen → notification gelezen, order blijft actie vereisen.
 * 4. Verzenden → checklist + modal, daarna uit actie-teller.
 * 5. Duplicate webhook → max 1 notification per order.
 * 6. Andere seller → geen toegang tot orders/notifications.
 */
