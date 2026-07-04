-- =============================================================================
-- seller_notification_realtime_RUN_IN_DASHBOARD.sql
-- Run in Supabase SQL Editor if 0046 is not yet pushed via CLI.
-- =============================================================================

alter table public.seller_notifications
  add column if not exists toast_shown_at timestamptz null;

create index if not exists seller_notifications_pending_toast_idx
  on public.seller_notifications (seller_id, created_at asc)
  where notification_type = 'new_paid_order'
    and read_at is null
    and toast_shown_at is null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seller_notifications'
  ) then
    alter publication supabase_realtime add table public.seller_notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'buyer_notifications'
  ) then
    alter publication supabase_realtime add table public.buyer_notifications;
  end if;
end $$;

-- Optional: mark older unread rows as toast-shown so they do not replay on deploy.
-- update public.seller_notifications
-- set toast_shown_at = coalesce(toast_shown_at, now())
-- where notification_type = 'new_paid_order'
--   and toast_shown_at is null
--   and created_at < now() - interval '3 hours';
