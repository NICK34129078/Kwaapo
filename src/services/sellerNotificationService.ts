import { supabase } from "../lib/supabase";
import { inAppToastPendingCutoffIso } from "../utils/inAppNotification";

export type SellerNotification = {
  id: string;
  sellerId: string;
  orderId: string;
  notificationType: string;
  title: string;
  body: string;
  productName: string | null;
  readAt: string | null;
  handledAt: string | null;
  toastShownAt: string | null;
  createdAt: string;
};

type SellerNotificationRow = {
  id: string;
  seller_id: string;
  order_id: string;
  notification_type: string;
  title: string;
  body: string;
  product_name: string | null;
  read_at: string | null;
  handled_at: string | null;
  toast_shown_at?: string | null;
  created_at: string;
};

function mapRow(row: SellerNotificationRow): SellerNotification {
  return {
    id: row.id,
    sellerId: row.seller_id,
    orderId: row.order_id,
    notificationType: row.notification_type,
    title: row.title,
    body: row.body,
    productName: row.product_name,
    readAt: row.read_at,
    handledAt: row.handled_at,
    toastShownAt: row.toast_shown_at ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchOpenSellerNotifications(): Promise<SellerNotification[]> {
  const { data, error } = await supabase
    .from("seller_notifications")
    .select("*")
    .is("handled_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[sellerNotificationService] fetch open failed", error.message);
    return [];
  }

  return (data as SellerNotificationRow[]).map(mapRow);
}

export async function countUnreadSellerNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  if (error) {
    console.warn("[sellerNotificationService] unread count failed", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchSellerNotificationsForActivity(
  limit = 50
): Promise<SellerNotification[]> {
  const { data, error } = await supabase
    .from("seller_notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[sellerNotificationService] fetch activity list failed", error.message);
    return [];
  }

  return (data as SellerNotificationRow[]).map(mapRow);
}

/** Legacy: unread new_paid_order only (toast queue helpers). */
export async function countUnreadNewPaidSellerNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .eq("notification_type", "new_paid_order");

  if (error) {
    console.warn("[sellerNotificationService] unread count failed", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function fetchUnreadSellerNotifications(): Promise<SellerNotification[]> {
  const { data, error } = await supabase
    .from("seller_notifications")
    .select("*")
    .is("read_at", null)
    .eq("notification_type", "new_paid_order")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.warn("[sellerNotificationService] fetch unread failed", error.message);
    return [];
  }

  return (data as SellerNotificationRow[]).map(mapRow);
}

/** Unread seller toasts not yet shown in-app (FIFO queue on app open). */
export async function fetchPendingSellerToastNotifications(): Promise<
  SellerNotification[]
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const cutoff = inAppToastPendingCutoffIso();
  const { data, error } = await supabase
    .from("seller_notifications")
    .select("*")
    .eq("seller_id", user.id)
    .eq("notification_type", "new_paid_order")
    .is("toast_shown_at", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) {
    console.warn(
      "[sellerNotificationService] fetch pending toast failed",
      error.message
    );
    return [];
  }

  return (data as SellerNotificationRow[]).map(mapRow);
}

export async function markSellerNotificationToastShown(
  notificationId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("seller_notifications")
    .update({ toast_shown_at: now })
    .eq("id", notificationId)
    .is("toast_shown_at", null);

  if (error) {
    console.warn(
      "[sellerNotificationService] mark toast shown failed",
      error.message
    );
  }
}

export async function countOpenSellerNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .is("handled_at", null);

  if (error) {
    console.warn("[sellerNotificationService] count failed", error.message);
    return 0;
  }

  return count ?? 0;
}

export async function markSellerNotificationRead(
  notificationId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("seller_notifications")
    .update({ read_at: now })
    .eq("id", notificationId)
    .is("read_at", null);

  if (error) {
    console.warn("[sellerNotificationService] mark read failed", error.message);
  }
}

export async function markSellerNotificationsReadForOrder(
  orderId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("seller_notifications")
    .update({ read_at: now })
    .eq("order_id", orderId)
    .is("read_at", null);

  if (error) {
    console.warn(
      "[sellerNotificationService] mark read for order failed",
      error.message
    );
  }
}

export async function markSellerNotificationsHandledForOrder(
  orderId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("seller_notifications")
    .update({ handled_at: now, read_at: now })
    .eq("order_id", orderId)
    .is("handled_at", null);

  if (error) {
    console.warn(
      "[sellerNotificationService] mark handled for order failed",
      error.message
    );
  }
}
