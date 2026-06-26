-- =============================================================================
-- 0036_prelaunch_compliance.sql
-- Moderation queue, account deletion, buyer ship notifications, RLS hardening.
-- Run via: supabase db push  OR  paste in Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unified moderation reports (products, profiles, sellers)
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id text not null,
  reason text not null,
  details text,
  status text not null default 'open',
  reviewed_by uuid null references public.profiles (id),
  reviewed_at timestamptz null,
  decision_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_reports_target_type_check check (
    target_type in ('product', 'profile', 'seller', 'comment', 'post')
  ),
  constraint moderation_reports_status_check check (
    status in (
      'open',
      'under_review',
      'resolved_removed',
      'resolved_no_action',
      'resolved_warning',
      'resolved_suspended'
    )
  ),
  constraint moderation_reports_reporter_target_unique unique (
    reporter_id,
    target_type,
    target_id
  )
);

create index if not exists moderation_reports_status_created_idx
  on public.moderation_reports (status, created_at desc);

create index if not exists moderation_reports_target_idx
  on public.moderation_reports (target_type, target_id, created_at desc);

comment on table public.moderation_reports is
  'Centrale moderation queue. Alleen reporter ziet eigen meldingen; admins via service_role.';

alter table public.moderation_reports enable row level security;

drop policy if exists "Users read own moderation reports" on public.moderation_reports;
create policy "Users read own moderation reports"
  on public.moderation_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Users insert own moderation reports" on public.moderation_reports;
create policy "Users insert own moderation reports"
  on public.moderation_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Product moderation status
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists moderation_status text;

update public.products
set moderation_status = 'approved'
where moderation_status is null;

alter table public.products
  alter column moderation_status set default 'approved';

alter table public.products
  alter column moderation_status set not null;

alter table public.products
  drop constraint if exists products_moderation_status_check;

alter table public.products
  add constraint products_moderation_status_check check (
    moderation_status in ('approved', 'under_review', 'removed', 'prohibited')
  );

comment on column public.products.moderation_status is
  'approved = publiek koopbaar indien actief; under_review/prohibited/removed = verborgen.';

-- ---------------------------------------------------------------------------
-- 3. Profile compliance columns
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists app_terms_version text null,
  add column if not exists app_terms_accepted_at timestamptz null,
  add column if not exists moderation_suspended_at timestamptz null,
  add column if not exists account_deletion_status text null,
  add column if not exists account_deletion_requested_at timestamptz null;

alter table public.profiles
  drop constraint if exists profiles_account_deletion_status_check;

alter table public.profiles
  add constraint profiles_account_deletion_status_check check (
    account_deletion_status is null
    or account_deletion_status in ('requested', 'processing', 'completed', 'rejected')
  );

-- ---------------------------------------------------------------------------
-- 4. Account deletion requests
-- ---------------------------------------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'requested',
  reason text null,
  requested_at timestamptz not null default now(),
  processed_at timestamptz null,
  constraint account_deletion_requests_status_check check (
    status in ('requested', 'processing', 'completed', 'rejected', 'cancelled')
  )
);

create unique index if not exists account_deletion_requests_user_open_idx
  on public.account_deletion_requests (user_id)
  where status in ('requested', 'processing');

alter table public.account_deletion_requests enable row level security;

drop policy if exists "Users read own deletion requests" on public.account_deletion_requests;
create policy "Users read own deletion requests"
  on public.account_deletion_requests
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own deletion requests" on public.account_deletion_requests;
create policy "Users insert own deletion requests"
  on public.account_deletion_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Buyer in-app notifications (geen adres in body)
-- ---------------------------------------------------------------------------
create table if not exists public.buyer_notifications (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  notification_type text not null default 'order_shipped',
  title text not null,
  body text not null,
  product_name text null,
  read_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint buyer_notifications_type_check check (
    notification_type in ('order_shipped')
  ),
  constraint buyer_notifications_order_dedup unique (
    buyer_id,
    order_id,
    notification_type
  )
);

create index if not exists buyer_notifications_buyer_created_idx
  on public.buyer_notifications (buyer_id, created_at desc);

alter table public.buyer_notifications enable row level security;

drop policy if exists "Buyers read own notifications" on public.buyer_notifications;
create policy "Buyers read own notifications"
  on public.buyer_notifications
  for select
  to authenticated
  using (auth.uid() = buyer_id);

drop policy if exists "Buyers update own notifications" on public.buyer_notifications;
create policy "Buyers update own notifications"
  on public.buyer_notifications
  for update
  to authenticated
  using (auth.uid() = buyer_id)
  with check (auth.uid() = buyer_id);

-- ---------------------------------------------------------------------------
-- 6. Seller eligibility helper (terms + KVK + suspension)
-- ---------------------------------------------------------------------------
create or replace function public.is_verified_payout_ready_seller(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.seller_onboarding_status = 'verified'
      and p.stripe_connect_account_id is not null
      and length(trim(p.stripe_connect_account_id)) > 0
      and p.stripe_connect_onboarding_complete = true
      and p.stripe_charges_enabled = true
      and p.stripe_payouts_enabled = true
      and p.kvk_verified_at is not null
      and p.seller_terms_version is not null
      and length(trim(p.seller_terms_version)) > 0
      and p.seller_terms_accepted_at is not null
      and p.moderation_suspended_at is null
      and coalesce(p.account_deletion_status, '') not in ('requested', 'processing')
  );
$$;

comment on function public.is_verified_payout_ready_seller(uuid) is
  'True when seller may publish active products: Stripe + KVK + seller terms + not suspended.';

-- ---------------------------------------------------------------------------
-- 7. RPC: submit moderation report
-- ---------------------------------------------------------------------------
create or replace function public.submit_moderation_report(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  v_inserted uuid;
  v_product_id uuid;
begin
  if v_reporter is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if p_target_type not in ('product', 'profile', 'seller', 'comment', 'post') then
    return jsonb_build_object('success', false, 'reason', 'invalid_target_type');
  end if;

  if length(trim(coalesce(p_target_id, ''))) = 0 then
    return jsonb_build_object('success', false, 'reason', 'invalid_target_id');
  end if;

  if p_target_type in ('profile', 'seller') and p_target_id = v_reporter::text then
    return jsonb_build_object('success', false, 'reason', 'cannot_report_self');
  end if;

  insert into public.moderation_reports (
    reporter_id,
    target_type,
    target_id,
    reason,
    details,
    status
  )
  values (
    v_reporter,
    p_target_type,
    trim(p_target_id),
    trim(p_reason),
    nullif(trim(coalesce(p_details, '')), ''),
    'open'
  )
  on conflict (reporter_id, target_type, target_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('success', true, 'duplicate', true);
  end if;

  if p_target_type = 'product' then
    begin
      v_product_id := p_target_id::uuid;
      update public.products
      set moderation_status = 'under_review'
      where id = v_product_id
        and moderation_status = 'approved';
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('success', true, 'report_id', v_inserted);
end;
$$;

revoke all on function public.submit_moderation_report(text, text, text, text) from public;
grant execute on function public.submit_moderation_report(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. RPC: request account deletion (anonimiseer + deactiveer listings)
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_suffix text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'reason', 'not_authenticated');
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_user
      and account_deletion_status in ('requested', 'processing', 'completed')
  ) then
    return jsonb_build_object('success', true, 'already_requested', true);
  end if;

  insert into public.account_deletion_requests (user_id, status, reason)
  values (v_user, 'requested', nullif(trim(coalesce(p_reason, '')), ''))
  on conflict do nothing;

  v_suffix := left(replace(v_user::text, '-', ''), 8);

  perform set_config('app.bypass_profile_protect', 'true', true);

  update public.profiles
  set
    username = 'deleted_' || v_suffix,
    display_name = 'Verwijderd account',
    bio = null,
    avatar_url = null,
    account_deletion_status = 'requested',
    account_deletion_requested_at = now()
  where id = v_user;

  update public.products
  set is_active = false, moderation_status = 'removed'
  where owner_id = v_user;

  update public.posts
  set is_deleted = true
  where user_id = v_user::text;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.request_account_deletion(text) from public;
grant execute on function public.request_account_deletion(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Buyer notification on ship (trigger)
-- ---------------------------------------------------------------------------
create or replace function public.notify_buyer_order_shipped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_name text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.shipping_status = new.shipping_status then
    return new;
  end if;

  if new.shipping_status <> 'shipped' then
    return new;
  end if;

  if new.payment_status <> 'paid' then
    return new;
  end if;

  select oi.product_name
  into v_product_name
  from public.order_items oi
  where oi.order_id = new.id
  order by oi.created_at asc
  limit 1;

  insert into public.buyer_notifications (
    buyer_id,
    order_id,
    notification_type,
    title,
    body,
    product_name
  )
  values (
    new.buyer_id,
    new.id,
    'order_shipped',
    'Je bestelling is verzonden',
    coalesce(
      'Goed nieuws: ' || nullif(trim(v_product_name), '') || ' is onderweg.',
      'Je bestelling is onderweg.'
    ),
    nullif(trim(v_product_name), '')
  )
  on conflict (buyer_id, order_id, notification_type) do nothing;

  return new;
end;
$$;

drop trigger if exists orders_notify_buyer_shipped on public.orders;
create trigger orders_notify_buyer_shipped
  after update of shipping_status on public.orders
  for each row
  execute function public.notify_buyer_order_shipped();

-- ---------------------------------------------------------------------------
-- 10. Profiles RLS (idempotent)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles readable by authenticated" on public.profiles;
create policy "Profiles readable by authenticated"
  on public.profiles
  for select
  to authenticated
  using (
    account_deletion_status is null
    or account_deletion_status not in ('requested', 'processing', 'completed')
  );

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles
  for insert
  to authenticated
  with check (id = auth.uid());

-- Block client updates to payment/seller/moderation fields
create or replace function public.protect_profile_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.bypass_profile_protect', true) = 'true' then
    return new;
  end if;

  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if new.seller_onboarding_status is distinct from old.seller_onboarding_status then
    raise exception 'seller_onboarding_status is read-only';
  end if;
  if new.stripe_connect_account_id is distinct from old.stripe_connect_account_id then
    raise exception 'stripe_connect_account_id is read-only';
  end if;
  if new.stripe_connect_onboarding_complete is distinct from old.stripe_connect_onboarding_complete then
    raise exception 'stripe fields are read-only';
  end if;
  if new.stripe_charges_enabled is distinct from old.stripe_charges_enabled then
    raise exception 'stripe fields are read-only';
  end if;
  if new.stripe_payouts_enabled is distinct from old.stripe_payouts_enabled then
    raise exception 'stripe fields are read-only';
  end if;
  if new.kvk_verified_at is distinct from old.kvk_verified_at then
    raise exception 'kvk_verified_at is read-only';
  end if;
  if new.kvk_number is distinct from old.kvk_number then
    raise exception 'kvk_number is read-only';
  end if;
  if new.moderation_suspended_at is distinct from old.moderation_suspended_at then
    raise exception 'moderation_suspended_at is read-only';
  end if;
  if new.account_deletion_status is distinct from old.account_deletion_status then
    raise exception 'account_deletion_status is read-only';
  end if;
  if new.account_deletion_requested_at is distinct from old.account_deletion_requested_at then
    raise exception 'account_deletion_requested_at is read-only';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_sensitive on public.profiles;
create trigger profiles_protect_sensitive
  before update on public.profiles
  for each row
  execute function public.protect_profile_sensitive_columns();

-- ---------------------------------------------------------------------------
-- 11. Posts RLS tighten (reads unchanged; writes scoped to owner)
-- ---------------------------------------------------------------------------
drop policy if exists "Allow insert post" on public.posts;
drop policy if exists "Allow update own for soft delete" on public.posts;

drop policy if exists "Authenticated insert own posts" on public.posts;
create policy "Authenticated insert own posts"
  on public.posts
  for insert
  to authenticated
  with check (user_id = auth.uid()::text);

drop policy if exists "Authenticated update own posts" on public.posts;
create policy "Authenticated update own posts"
  on public.posts
  for update
  to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 12. Public product read excludes moderated listings
-- ---------------------------------------------------------------------------
drop policy if exists "Public read active products" on public.products;

create policy "Public read active products"
  on public.products
  for select
  to authenticated, anon
  using (
    is_active = true
    and moderation_status = 'approved'
  );

-- Owners still read own products via existing policy "Owners read own products"

-- ---------------------------------------------------------------------------
-- 13. Avatars storage bucket (if missing)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
