-- =============================================================================
-- Kwaapo: seller voorraad beheer + historie (veilig bovenop checkout-reservering)
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor.
-- Vereist: order_stock_reservation_RUN_IN_DASHBOARD.sql (stock_* kolommen op orders).
--
-- products.stock = beschikbare voorraad (al verminderd door actieve reserveringen).
-- Handmatige wijzigingen alleen via adjust_product_stock RPC (niet direct UPDATE).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Historie
-- ---------------------------------------------------------------------------
create table if not exists public.product_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  change_amount int not null,
  stock_before int not null check (stock_before >= 0),
  stock_after int not null check (stock_after >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists product_stock_adjustments_product_created_idx
  on public.product_stock_adjustments (product_id, created_at desc);

create index if not exists product_stock_adjustments_seller_created_idx
  on public.product_stock_adjustments (seller_id, created_at desc);

comment on table public.product_stock_adjustments is
  'Audit trail for product stock changes (manual seller actions and checkout lifecycle).';

alter table public.product_stock_adjustments enable row level security;

drop policy if exists "Sellers read own product stock history" on public.product_stock_adjustments;
create policy "Sellers read own product stock history"
  on public.product_stock_adjustments
  for select
  to authenticated
  using (
    seller_id = auth.uid()
    and exists (
      select 1
      from public.products p
      where p.id = product_stock_adjustments.product_id
        and p.owner_id = auth.uid()
    )
  );

-- Geen INSERT/UPDATE/DELETE policies voor authenticated — alleen via SECURITY DEFINER functies.

-- ---------------------------------------------------------------------------
-- Interne helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_business_seller(p_user_id uuid)
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
      and p.seller_type = 'business'
  );
$$;

create or replace function public.active_reserved_quantity_for_product(p_product_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.stock_reserved_at is not null
    and o.stock_released_at is null
    and o.stock_committed_at is null
    and o.payment_status = 'unpaid';
$$;

create or replace function public.log_product_stock_adjustment(
  p_product_id uuid,
  p_seller_id uuid,
  p_change_amount int,
  p_stock_before int,
  p_stock_after int,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_stock_adjustments (
    product_id,
    seller_id,
    change_amount,
    stock_before,
    stock_after,
    reason
  )
  values (
    p_product_id,
    p_seller_id,
    p_change_amount,
    p_stock_before,
    p_stock_after,
    left(trim(p_reason), 120)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Blokkeer directe stock-updates door sellers (gebruik adjust_product_stock)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_stock_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock is not distinct from old.stock then
    return new;
  end if;

  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  -- Transaction-local flag (set_config(..., true)) — alleen binnen dezelfde RPC-transactie.
  if current_setting('app.allow_stock_update', true) = 'true' then
    return new;
  end if;

  raise exception 'products: voorraad kan alleen via voorraad beheer worden aangepast';
end;
$$;

drop trigger if exists enforce_product_stock_update_integrity_trigger on public.products;

create trigger enforce_product_stock_update_integrity_trigger
  before update on public.products
  for each row
  execute function public.enforce_product_stock_update_integrity();

-- ---------------------------------------------------------------------------
-- Seller RPC: voorraad toevoegen of totaal aanpassen
-- ---------------------------------------------------------------------------
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_mode text,
  p_value int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_before int;
  v_after int;
  v_change int;
  v_reason text;
  v_reserved int;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen voorraad beheren';
  end if;

  if p_product_id is null then
    raise exception 'Product ontbreekt';
  end if;

  select id, owner_id, stock
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product niet gevonden';
  end if;

  if v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  v_before := greatest(0, coalesce(v_product.stock, 0));
  v_reserved := public.active_reserved_quantity_for_product(p_product_id);

  if lower(trim(p_mode)) = 'add' then
    if p_value is null or p_value <= 0 then
      raise exception 'Voer een positief aantal in om toe te voegen';
    end if;
    v_after := v_before + p_value;
    v_change := p_value;
    v_reason := 'Voorraad toegevoegd';
  elsif lower(trim(p_mode)) = 'set' then
    if p_value is null or p_value < 0 then
      raise exception 'Voorraad kan niet lager zijn dan 0';
    end if;
    v_after := p_value;
    v_change := v_after - v_before;
    v_reason := 'Voorraad gecorrigeerd';
  else
    raise exception 'Ongeldige voorraadactie';
  end if;

  if v_after < 0 then
    raise exception 'Voorraad kan niet lager zijn dan 0';
  end if;

  perform set_config('app.allow_stock_update', 'true', true);

  update public.products
  set stock = v_after
  where id = p_product_id;

  perform public.log_product_stock_adjustment(
    p_product_id,
    v_user_id,
    v_change,
    v_before,
    v_after,
    v_reason
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'change_amount', v_change,
    'reason', v_reason,
    'active_reserved', v_reserved
  );
end;
$$;

comment on function public.adjust_product_stock(uuid, text, int) is
  'Seller-only: add or set available product stock with audit log.';

revoke all on function public.adjust_product_stock(uuid, text, int) from public;
revoke all on function public.adjust_product_stock(uuid, text, int) from anon;
grant execute on function public.adjust_product_stock(uuid, text, int) to authenticated;

revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from public;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from anon;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from authenticated;

revoke all on function public.is_business_seller(uuid) from public;
revoke all on function public.is_business_seller(uuid) from anon;
revoke all on function public.is_business_seller(uuid) from authenticated;

revoke all on function public.active_reserved_quantity_for_product(uuid) from public;
revoke all on function public.active_reserved_quantity_for_product(uuid) from anon;
revoke all on function public.active_reserved_quantity_for_product(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Checkout stock functies: allow flag + historie (vervangt eerdere versies)
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
  v_before int;
  v_after int;
  v_owner uuid;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    id,
    seller_id,
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

  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select stock, owner_id into v_before, v_owner
    from public.products
    where id = item.product_id
    for update;

    perform set_config('app.allow_stock_update', 'true', true);

    update public.products
    set stock = stock - item.quantity
    where id = item.product_id
      and stock >= item.quantity;

    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      return false;
    end if;

    select stock into v_after from public.products where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      -item.quantity,
      v_before,
      v_after,
      'Checkout gereserveerd'
    );
  end loop;

  update public.orders
  set
    stock_reserved_at = now(),
    stock_released_at = null
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_owner uuid;
  v_stock int;
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

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select owner_id, stock into v_owner, v_stock
    from public.products
    where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      -item.quantity,
      v_stock,
      v_stock,
      'Verkocht'
    );
  end loop;

  return true;
end;
$$;

create or replace function public.release_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_before int;
  v_after int;
  v_owner uuid;
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
    select stock, owner_id into v_before, v_owner
    from public.products
    where id = item.product_id
    for update;

    perform set_config('app.allow_stock_update', 'true', true);

    update public.products
    set stock = stock + item.quantity
    where id = item.product_id;

    select stock into v_after from public.products where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      item.quantity,
      v_before,
      v_after,
      'Checkout verlopen'
    );
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.reserve_product_stock_for_order(uuid) from public;
revoke all on function public.reserve_product_stock_for_order(uuid) from anon;
revoke all on function public.reserve_product_stock_for_order(uuid) from authenticated;
revoke all on function public.commit_product_stock_for_order(uuid) from public;
revoke all on function public.commit_product_stock_for_order(uuid) from anon;
revoke all on function public.commit_product_stock_for_order(uuid) from authenticated;
revoke all on function public.release_product_stock_for_order(uuid) from public;
revoke all on function public.release_product_stock_for_order(uuid) from anon;
revoke all on function public.release_product_stock_for_order(uuid) from authenticated;

grant execute on function public.reserve_product_stock_for_order(uuid) to service_role;
grant execute on function public.commit_product_stock_for_order(uuid) to service_role;
grant execute on function public.release_product_stock_for_order(uuid) to service_role;

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

revoke all on function public.decrement_product_stock_for_order(uuid) from public;
revoke all on function public.decrement_product_stock_for_order(uuid) from anon;
revoke all on function public.decrement_product_stock_for_order(uuid) from authenticated;
grant execute on function public.decrement_product_stock_for_order(uuid) to service_role;
