-- =============================================================================
-- 0047_in_app_toast_shown_once.sql
-- Permanent in-app toast status for buyer + tighten seller pending index.
-- Backfill: mark historical notifications as toast-shown (no popup replay).
-- =============================================================================

alter table public.buyer_notifications
  add column if not exists toast_shown_at timestamptz null;

comment on column public.buyer_notifications.toast_shown_at is
  'Set when the buyer in-app toast was queued/shown. Separate from read_at (badge/tap).';

create index if not exists buyer_notifications_pending_toast_idx
  on public.buyer_notifications (buyer_id, created_at asc)
  where notification_type = 'order_shipped'
    and toast_shown_at is null;

drop index if exists public.seller_notifications_pending_toast_idx;

create index if not exists seller_notifications_pending_toast_idx
  on public.seller_notifications (seller_id, created_at asc)
  where notification_type = 'new_paid_order'
    and toast_shown_at is null;

-- One-time safe backfill: old rows must never replay as in-app popups.
update public.seller_notifications
set toast_shown_at = coalesce(toast_shown_at, now())
where notification_type = 'new_paid_order'
  and toast_shown_at is null
  and created_at < now() - interval '60 seconds';

update public.buyer_notifications
set toast_shown_at = coalesce(toast_shown_at, now())
where notification_type = 'order_shipped'
  and toast_shown_at is null
  and created_at < now() - interval '60 seconds';
