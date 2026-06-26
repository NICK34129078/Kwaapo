-- =============================================================================
-- seller_notifications_RUN_IN_DASHBOARD.sql
-- Plak dit één keer in Supabase → SQL Editor → Run.
-- =============================================================================

create table if not exists public.seller_notifications (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  notification_type text not null default 'new_paid_order',
  title text not null,
  body text not null,
  product_name text null,
  read_at timestamptz null,
  handled_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint seller_notifications_type_check check (
    notification_type in ('new_paid_order')
  ),
  constraint seller_notifications_order_dedup unique (
    seller_id,
    order_id,
    notification_type
  )
);

create index if not exists seller_notifications_seller_created_idx
  on public.seller_notifications (seller_id, created_at desc);

create index if not exists seller_notifications_seller_open_idx
  on public.seller_notifications (seller_id, created_at desc)
  where handled_at is null;

comment on table public.seller_notifications is
  'In-app seller alerts. Created server-side after payment confirmation. No shipping address stored here.';

alter table public.seller_notifications enable row level security;

drop policy if exists "Sellers read own notifications" on public.seller_notifications;
create policy "Sellers read own notifications"
  on public.seller_notifications
  for select
  to authenticated
  using (auth.uid() = seller_id);

drop policy if exists "Sellers update own notifications" on public.seller_notifications;
create policy "Sellers update own notifications"
  on public.seller_notifications
  for update
  to authenticated
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- Inserts: service_role (Stripe worker) only — no authenticated INSERT policy.
