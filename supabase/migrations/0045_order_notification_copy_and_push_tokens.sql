-- Premium notification copy + push token storage (client upsert; server sends push later).

create or replace function public.notify_buyer_order_shipped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_name text;
  v_seller_name text;
  v_body text;
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

  select p.name
  into v_product_name
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = new.id
  order by oi.created_at asc
  limit 1;

  select coalesce(
    nullif(trim(pr.display_name), ''),
    nullif(trim(pr.username), ''),
    'de verkoper'
  )
  into v_seller_name
  from public.profiles pr
  where pr.id = new.seller_id;

  v_body := coalesce(nullif(trim(v_product_name), ''), 'Je bestelling')
    || ' is verzonden door '
    || coalesce(v_seller_name, 'de verkoper')
    || '.';

  if new.tracking_code is not null and length(trim(new.tracking_code)) > 0 then
    v_body := v_body || ' Volg je pakket met de trackinginformatie.';
  end if;

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
    'Je bestelling is onderweg 📦',
    v_body,
    nullif(trim(v_product_name), '')
  )
  on conflict (buyer_id, order_id, notification_type) do nothing;

  return new;
end;
$$;

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint push_device_tokens_user_token_key unique (user_id, expo_push_token)
);

create index if not exists push_device_tokens_user_id_idx
  on public.push_device_tokens (user_id, updated_at desc);

alter table public.push_device_tokens enable row level security;

drop policy if exists push_device_tokens_select_own on public.push_device_tokens;
create policy push_device_tokens_select_own
  on public.push_device_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists push_device_tokens_insert_own on public.push_device_tokens;
create policy push_device_tokens_insert_own
  on public.push_device_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists push_device_tokens_update_own on public.push_device_tokens;
create policy push_device_tokens_update_own
  on public.push_device_tokens
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists push_device_tokens_delete_own on public.push_device_tokens;
create policy push_device_tokens_delete_own
  on public.push_device_tokens
  for delete
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
