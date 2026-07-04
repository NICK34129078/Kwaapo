-- =============================================================================
-- 0046_seller_notification_realtime_toast.sql
-- Enable Supabase Realtime on notification tables + track in-app toast display.
-- =============================================================================

alter table public.seller_notifications
  add column if not exists toast_shown_at timestamptz null;

comment on column public.seller_notifications.toast_shown_at is
  'Set when the seller in-app toast was queued/shown. Separate from read_at (badge/tap).';

create index if not exists seller_notifications_pending_toast_idx
  on public.seller_notifications (seller_id, created_at asc)
  where notification_type = 'new_paid_order'
    and read_at is null
    and toast_shown_at is null;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'seller_notifications'
  ) then
    alter publication supabase_realtime add table public.seller_notifications;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'buyer_notifications'
  ) then
    alter publication supabase_realtime add table public.buyer_notifications;
  end if;
end $$;
