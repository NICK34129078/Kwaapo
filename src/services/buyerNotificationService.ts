import { supabase } from "../lib/supabase";
import { inAppToastPendingCutoffIso } from "../utils/inAppNotification";

export type BuyerNotification = {
  id: string;
  orderId: string;
  notificationType: string;
  title: string;
  body: string;
  productName: string | null;
  readAt: string | null;
  toastShownAt: string | null;
  createdAt: string;
};

type BuyerNotificationRow = {
  id: string;
  order_id: string;
  notification_type: string;
  title: string;
  body: string;
  product_name: string | null;
  read_at: string | null;
  toast_shown_at?: string | null;
  created_at: string;
};

function mapRow(row: BuyerNotificationRow): BuyerNotification {
  return {
    id: row.id,
    orderId: row.order_id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    productName: row.product_name,
    readAt: row.read_at,
    toastShownAt: row.toast_shown_at ?? null,
    createdAt: row.created_at,
  };
}
export async function fetchUnreadBuyerNotificationCount(): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return 0;
  }

  const { count, error } = await supabase
    .from("buyer_notifications")
    .select("id", { count: "exact", head: true })
    .eq("buyer_id", user.id)
    .is("read_at", null);

  if (error) {
    console.warn("[buyerNotifications] count failed");
    return 0;
  }

  return count ?? 0;
}

export async function fetchRecentBuyerNotifications(
  limit = 20
): Promise<BuyerNotification[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("buyer_notifications")
    .select(
      "id, order_id, notification_type, title, body, product_name, read_at, toast_shown_at, created_at"
    )
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 50));

  if (error) {
    console.warn("[buyerNotifications] fetch failed");
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as BuyerNotificationRow));
}

/** Unread buyer toasts not yet shown in-app (FIFO queue on app open). */
export async function fetchPendingBuyerToastNotifications(): Promise<
  BuyerNotification[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const cutoff = inAppToastPendingCutoffIso();
  const { data, error } = await supabase
    .from("buyer_notifications")
    .select(
      "id, order_id, notification_type, title, body, product_name, read_at, toast_shown_at, created_at"
    )
    .eq("buyer_id", user.id)
    .eq("notification_type", "order_shipped")
    .is("toast_shown_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    console.warn(
      "[buyerNotificationService] fetch pending toast failed",
      error.message
    );
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as BuyerNotificationRow));
}

export async function markBuyerNotificationToastShown(
  notificationId: string
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("buyer_notifications")
    .update({ toast_shown_at: now })
    .eq("id", notificationId)
    .eq("buyer_id", user.id)
    .is("toast_shown_at", null);

  if (error) {
    console.warn(
      "[buyerNotificationService] mark toast shown failed",
      error.message
    );
  }
}

export async function markBuyerNotificationRead(notificationId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  await supabase
    .from("buyer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("buyer_id", user.id);
}
