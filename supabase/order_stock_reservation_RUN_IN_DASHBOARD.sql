-- =============================================================================
-- Kwaapo: voorraad-reservering bij checkout + commit/release bij betaling
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor vóór Worker deploy met reservation-flow.
--
-- Vervangt checkout_stock_decrement_RUN_IN_DASHBOARD.sql:
--   reserve bij checkout start → commit bij paid (geen tweede decrement)
--   release bij checkout.session.expired (niet bij payment_intent.payment_failed)
-- =============================================================================

alter table public.orders
  add column if not exists stock_reserved_at timestamptz null,
  add column if not exists stock_released_at timestamptz null,
  add column if not exists stock_committed_at timestamptz null;

comment on column public.orders.stock_reserved_at is
  'When product stock was atomically reserved for this checkout session.';

comment on column public.orders.stock_released_at is
  'When reserved stock was returned after failed/expired checkout.';

comment on column public.orders.stock_committed_at is
  'When reserved stock became final after successful payment.';

-- ---------------------------------------------------------------------------
-- reserve: atomisch stock - qty, alleen als unpaid en nog niet actief gereserveerd
-- ---------------------------------------------------------------------------
create or replace function public.reserve_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  updated_rows int;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    id,
    payment_status,
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null or ord.payment_status = 'paid' then
    return false;
  end if;

  -- Actieve reservering (retry / dubbel tikken op dezelfde order)
  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    update public.products
    set stock = stock - item.quantity
    where id = item.product_id
      and stock >= item.quantity;

    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      return false;
    end if;
  end loop;

  update public.orders
  set
    stock_reserved_at = now(),
    stock_released_at = null
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- commit: na succesvolle betaling — stock al afgetrokken bij reserve
-- ---------------------------------------------------------------------------
create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null or ord.stock_released_at is not null then
    return false;
  end if;

  update public.orders
  set stock_committed_at = now()
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- release: bij expired/failed checkout — stock teruggeven
-- ---------------------------------------------------------------------------
create or replace function public.release_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return false;
  end if;

  if ord.stock_released_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    update public.products
    set stock = stock + item.quantity
    where id = item.product_id;
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

comment on function public.reserve_product_stock_for_order(uuid) is
  'Atomically reserve stock when Stripe checkout starts. Idempotent for active reservations.';

comment on function public.commit_product_stock_for_order(uuid) is
  'Finalize reserved stock after payment. Does not decrement stock again.';

comment on function public.release_product_stock_for_order(uuid) is
  'Return reserved stock after failed/expired checkout. Idempotent.';

revoke all on function public.reserve_product_stock_for_order(uuid) from public;
revoke all on function public.commit_product_stock_for_order(uuid) from public;
revoke all on function public.release_product_stock_for_order(uuid) from public;

grant execute on function public.reserve_product_stock_for_order(uuid) to service_role;
grant execute on function public.commit_product_stock_for_order(uuid) to service_role;
grant execute on function public.release_product_stock_for_order(uuid) to service_role;

-- Legacy decrement: redirect to commit-only (no double decrement if reserve flow used)
create or replace function public.decrement_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.commit_product_stock_for_order(p_order_id);
end;
$$;

comment on function public.decrement_product_stock_for_order(uuid) is
  'Deprecated: use commit_product_stock_for_order after reserve flow.';

revoke all on function public.decrement_product_stock_for_order(uuid) from public;
grant execute on function public.decrement_product_stock_for_order(uuid) to service_role;
