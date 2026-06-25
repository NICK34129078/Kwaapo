-- =============================================================================
-- product_variant_stock_reservation_RUN_IN_DASHBOARD.sql
--
-- Run AFTER product_variants_RUN_IN_DASHBOARD.sql
-- Vervangt reserve/commit/release + adjust_product_stock voor variant-ondersteuning.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. order_items uitbreiding
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists product_variant_id uuid null references public.product_variants (id) on delete restrict,
  add column if not exists selected_variant_type text null,
  add column if not exists selected_variant_value text null;

create index if not exists order_items_variant_idx
  on public.order_items (product_variant_id)
  where product_variant_id is not null;

comment on column public.order_items.product_variant_id is
  'Gekozen variant bij checkout (verplicht wanneer products.variants_ready = true).';

-- ---------------------------------------------------------------------------
-- 2. adjust_product_stock — blokkeer bij actieve variantproducten
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

  select id, owner_id, stock, uses_variants, variants_ready
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

  if v_product.uses_variants and v_product.variants_ready then
    raise exception 'Gebruik voorraad per maat voor dit product';
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
    v_reason,
    null
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

-- ---------------------------------------------------------------------------
-- 3. reserve_product_stock_for_order
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
  v_product record;
  v_variant record;
  updated_rows int;
  v_before int;
  v_after int;
  v_owner uuid;
  v_reason text;
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
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity,
      oi.selected_variant_value
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select
      p.id,
      p.owner_id,
      p.uses_variants,
      p.variants_ready,
      p.stock
    into v_product
    from public.products p
    where p.id = item.product_id
    for update;

    if not found then
      return false;
    end if;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready then
      if item.product_variant_id is null then
        return false;
      end if;

      select pv.id, pv.product_id, pv.option_value, pv.stock, pv.seller_id
      into v_variant
      from public.product_variants pv
      where pv.id = item.product_variant_id
        and pv.product_id = item.product_id
        and pv.is_active = true
      for update;

      if not found then
        return false;
      end if;

      v_before := greatest(0, v_variant.stock);

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock - item.quantity
      where id = v_variant.id
        and stock >= item.quantity;

      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        return false;
      end if;

      select stock into v_after from public.product_variants where id = v_variant.id;

      v_reason := 'Maat ' || v_variant.option_value || ': checkout gereserveerd';

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_before,
        v_after,
        v_reason,
        v_variant.id
      );
    else
      v_before := greatest(0, v_product.stock);

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
        'Checkout gereserveerd',
        null
      );
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
-- 4. commit_product_stock_for_order
-- ---------------------------------------------------------------------------
create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_product record;
  v_variant record;
  v_owner uuid;
  v_stock int;
  v_option_value text;
  v_reason text;
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
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity,
      oi.selected_variant_value
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select uses_variants, variants_ready, owner_id
    into v_product
    from public.products
    where id = item.product_id;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready and item.product_variant_id is not null then
      select stock, option_value
      into v_stock, v_option_value
      from public.product_variants
      where id = item.product_variant_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_stock,
        v_stock,
        'Maat ' || v_option_value || ': verkocht',
        item.product_variant_id
      );
    else
      select stock into v_stock
      from public.products
      where id = item.product_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_stock,
        v_stock,
        'Verkocht',
        null
      );
    end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. release_product_stock_for_order
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
  v_product record;
  v_variant record;
  updated_rows int;
  v_before int;
  v_after int;
  v_owner uuid;
  v_reason text;
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
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select uses_variants, variants_ready, owner_id
    into v_product
    from public.products
    where id = item.product_id
    for update;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready and item.product_variant_id is not null then
      select id, stock, option_value
      into v_variant
      from public.product_variants
      where id = item.product_variant_id
      for update;

      v_before := greatest(0, v_variant.stock);

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock + item.quantity
      where id = v_variant.id;

      select stock into v_after from public.product_variants where id = v_variant.id;

      v_reason := 'Maat ' || v_variant.option_value || ': checkout verlopen';

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        item.quantity,
        v_before,
        v_after,
        v_reason,
        v_variant.id
      );
    else
      select stock into v_before
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
        'Checkout verlopen',
        null
      );
    end if;
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

comment on function public.reserve_product_stock_for_order(uuid) is
  'Reserve stock per variant when variants_ready, else products.stock.';

notify pgrst, 'reload schema';
