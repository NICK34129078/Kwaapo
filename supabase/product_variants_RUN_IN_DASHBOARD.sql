-- =============================================================================
-- product_variants_RUN_IN_DASHBOARD.sql
--
-- Run AFTER product_stock_management_RUN_IN_DASHBOARD.sql
-- Run BEFORE product_variant_stock_reservation_RUN_IN_DASHBOARD.sql
--
-- SAFE: IF NOT EXISTS, CREATE OR REPLACE, idempotent grants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Product flags
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists uses_variants boolean not null default false,
  add column if not exists variants_ready boolean not null default false;

comment on column public.products.uses_variants is
  'True when seller opted into per-size stock (may still use legacy stock until variants_ready).';
comment on column public.products.variants_ready is
  'True when variant stock is configured; checkout uses product_variants.stock.';

-- ---------------------------------------------------------------------------
-- 2. Variant table
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  option_type text not null default 'size',
  option_value text not null,
  sku text null,
  price_override numeric(10, 2) null check (price_override is null or price_override >= 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_option_unique unique (product_id, option_type, option_value)
);

create index if not exists product_variants_product_active_idx
  on public.product_variants (product_id, is_active, sort_order);

create index if not exists product_variants_seller_idx
  on public.product_variants (seller_id, product_id);

comment on table public.product_variants is
  'Per-size (or future option) stock. Source of truth when products.variants_ready = true.';

-- Historie per variant (nullable — legacy rows blijven null)
alter table public.product_stock_adjustments
  add column if not exists product_variant_id uuid null references public.product_variants (id) on delete set null;

create index if not exists product_stock_adjustments_variant_created_idx
  on public.product_stock_adjustments (product_variant_id, created_at desc)
  where product_variant_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.product_variants enable row level security;

drop policy if exists "Public read ready variants" on public.product_variants;
create policy "Public read ready variants"
  on public.product_variants
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and p.is_active = true
        and p.uses_variants = true
        and p.variants_ready = true
    )
  );

drop policy if exists "Owners read own variants" on public.product_variants;
create policy "Owners read own variants"
  on public.product_variants
  for select
  to authenticated
  using (seller_id = auth.uid());

-- No INSERT/UPDATE/DELETE for authenticated — only SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_product_variant_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_variants_updated_at on public.product_variants;
create trigger product_variants_updated_at
  before update on public.product_variants
  for each row
  execute function public.touch_product_variant_updated_at();

create or replace function public.sync_product_stock_from_variants(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum int;
  v_product record;
begin
  if p_product_id is null then
    return;
  end if;

  select id, uses_variants, variants_ready, owner_id
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found or not v_product.uses_variants or not v_product.variants_ready then
    return;
  end if;

  select coalesce(sum(pv.stock), 0)::int
  into v_sum
  from public.product_variants pv
  where pv.product_id = p_product_id
    and pv.is_active = true;

  perform set_config('app.allow_stock_update', 'true', true);

  update public.products
  set stock = greatest(0, v_sum)
  where id = p_product_id;
end;
$$;

create or replace function public.enforce_product_variant_stock_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.stock is not distinct from old.stock then
    return new;
  end if;

  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  if current_setting('app.allow_variant_stock_update', true) = 'true' then
    return new;
  end if;

  raise exception 'product_variants: voorraad kan alleen via voorraad beheer worden aangepast';
end;
$$;

drop trigger if exists enforce_product_variant_stock_integrity_trigger on public.product_variants;
create trigger enforce_product_variant_stock_integrity_trigger
  before update on public.product_variants
  for each row
  execute function public.enforce_product_variant_stock_integrity();

create or replace function public.sync_variants_after_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_product_stock_from_variants(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_product_stock_after_variant_change on public.product_variants;
create trigger sync_product_stock_after_variant_change
  after insert or update of stock, is_active or delete
  on public.product_variants
  for each row
  execute function public.sync_variants_after_stock_change();

-- ---------------------------------------------------------------------------
-- 5. Seller RPC: draft opt-in (migration — stock per maat 0, legacy stock blijft)
-- ---------------------------------------------------------------------------
drop function if exists public.enable_product_variants_draft(uuid, text[]);

create function public.enable_product_variants_draft(
  p_product_id uuid,
  p_option_values text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_val text;
  v_ord int := 0;
  v_created int := 0;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen varianten beheren';
  end if;

  select id, owner_id, uses_variants, variants_ready
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

  if v_product.variants_ready then
    raise exception 'Voorraad per maat is al actief';
  end if;

  if p_option_values is null or cardinality(p_option_values) = 0 then
    raise exception 'Kies minimaal één maat';
  end if;

  update public.products
  set uses_variants = true
  where id = p_product_id;

  foreach v_val in array p_option_values
  loop
    v_val := trim(v_val);
    if length(v_val) = 0 then
      continue;
    end if;
    v_ord := v_ord + 1;

    insert into public.product_variants (
      product_id,
      seller_id,
      option_type,
      option_value,
      stock,
      is_active,
      sort_order
    )
    values (
      p_product_id,
      v_user_id,
      'size',
      v_val,
      0,
      true,
      v_ord
    )
    on conflict (product_id, option_type, option_value) do update
      set
        is_active = true,
        sort_order = excluded.sort_order,
        updated_at = now();

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'product_id', p_product_id,
    'uses_variants', true,
    'variants_ready', false,
    'variants_created', v_created
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Seller RPC: save variant stocks (upsert values + stock)
-- ---------------------------------------------------------------------------
drop function if exists public.save_product_variant_stocks(uuid, jsonb);

create function public.save_product_variant_stocks(
  p_product_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_item jsonb;
  v_val text;
  v_stock int;
  v_ord int := 0;
  v_total int := 0;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen varianten beheren';
  end if;

  select id, owner_id, uses_variants, variants_ready
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

  if not v_product.uses_variants then
    raise exception 'Dit product gebruikt nog geen varianten';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Ongeldige variantgegevens';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_val := trim(coalesce(v_item->>'option_value', ''));
    if length(v_val) = 0 then
      continue;
    end if;
    v_ord := v_ord + 1;
    v_stock := greatest(0, coalesce((v_item->>'stock')::int, 0));

    perform set_config('app.allow_variant_stock_update', 'true', true);

    insert into public.product_variants (
      product_id,
      seller_id,
      option_type,
      option_value,
      stock,
      is_active,
      sort_order
    )
    values (
      p_product_id,
      v_user_id,
      coalesce(nullif(trim(v_item->>'option_type'), ''), 'size'),
      v_val,
      v_stock,
      coalesce((v_item->>'is_active')::boolean, true),
      v_ord
    )
    on conflict (product_id, option_type, option_value) do update
      set
        stock = excluded.stock,
        is_active = excluded.is_active,
        sort_order = excluded.sort_order,
        updated_at = now();

    v_total := v_total + v_stock;
  end loop;

  if v_product.variants_ready then
    perform public.sync_product_stock_from_variants(p_product_id);
  end if;

  return jsonb_build_object(
    'product_id', p_product_id,
    'variants_ready', v_product.variants_ready,
    'total_stock', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Seller RPC: activate variant mode (replaces legacy stock with sum)
-- ---------------------------------------------------------------------------
drop function if exists public.activate_product_variants(uuid);

create function public.activate_product_variants(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_count int;
  v_sum int;
  v_sizes text[];
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select id, owner_id, uses_variants, variants_ready, stock
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found or v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  if not v_product.uses_variants then
    raise exception 'Schakel eerst voorraad per maat in';
  end if;

  if v_product.variants_ready then
    return jsonb_build_object('product_id', p_product_id, 'variants_ready', true);
  end if;

  select count(*)::int, coalesce(sum(stock), 0)::int
  into v_count, v_sum
  from public.product_variants
  where product_id = p_product_id
    and is_active = true;

  if v_count = 0 then
    raise exception 'Voeg minimaal één maat toe';
  end if;

  update public.products
  set variants_ready = true
  where id = p_product_id;

  perform public.sync_product_stock_from_variants(p_product_id);

  select coalesce(array_agg(option_value order by sort_order, option_value), '{}'::text[])
  into v_sizes
  from public.product_variants
  where product_id = p_product_id
    and is_active = true;

  update public.products
  set sizes = to_jsonb(v_sizes)
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'variants_ready', true,
    'total_stock', v_sum
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Seller RPC: adjust single variant stock
-- ---------------------------------------------------------------------------
drop function if exists public.adjust_product_variant_stock(uuid, text, int);

create function public.adjust_product_variant_stock(
  p_variant_id uuid,
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
  v_variant record;
  v_before int;
  v_after int;
  v_change int;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select pv.*, p.variants_ready, p.uses_variants
  into v_variant
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id
  for update of pv;

  if not found then
    raise exception 'Maat niet gevonden';
  end if;

  if v_variant.seller_id is distinct from v_user_id then
    raise exception 'Geen toegang tot deze maat';
  end if;

  if not v_variant.uses_variants or not v_variant.variants_ready then
    raise exception 'Activeer eerst voorraad per maat';
  end if;

  v_before := greatest(0, v_variant.stock);

  if lower(trim(p_mode)) = 'add' then
    if p_value is null or p_value <= 0 then
      raise exception 'Voer een positief aantal in';
    end if;
    v_after := v_before + p_value;
    v_change := p_value;
    v_reason := 'Maat ' || v_variant.option_value || ': voorraad toegevoegd';
  elsif lower(trim(p_mode)) = 'set' then
    if p_value is null or p_value < 0 then
      raise exception 'Voorraad kan niet lager zijn dan 0';
    end if;
    v_after := p_value;
    v_change := v_after - v_before;
    v_reason := 'Maat ' || v_variant.option_value || ': voorraad aangepast';
  else
    raise exception 'Ongeldige voorraadactie';
  end if;

  perform set_config('app.allow_variant_stock_update', 'true', true);

  update public.product_variants
  set stock = v_after
  where id = p_variant_id;

  perform public.log_product_stock_adjustment(
    v_variant.product_id,
    v_user_id,
    v_change,
    v_before,
    v_after,
    v_reason,
    p_variant_id
  );

  return jsonb_build_object(
    'variant_id', p_variant_id,
    'option_value', v_variant.option_value,
    'stock_before', v_before,
    'stock_after', v_after,
    'change_amount', v_change
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. log_product_stock_adjustment (7-arg, with variant_id)
-- ---------------------------------------------------------------------------
drop function if exists public.log_product_stock_adjustment(uuid, uuid, int, int, int, text);
drop function if exists public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid);

create or replace function public.log_product_stock_adjustment(
  p_product_id uuid,
  p_seller_id uuid,
  p_change_amount int,
  p_stock_before int,
  p_stock_after int,
  p_reason text,
  p_variant_id uuid default null
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
    reason,
    product_variant_id
  )
  values (
    p_product_id,
    p_seller_id,
    p_change_amount,
    p_stock_before,
    p_stock_after,
    left(trim(p_reason), 160),
    p_variant_id
  );
end;
$$;

revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from public;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from anon;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from authenticated;

-- Grants (variant RPCs)
revoke all on function public.sync_product_stock_from_variants(uuid) from public;
revoke all on function public.enable_product_variants_draft(uuid, text[]) from public;
revoke all on function public.save_product_variant_stocks(uuid, jsonb) from public;
revoke all on function public.activate_product_variants(uuid) from public;
revoke all on function public.adjust_product_variant_stock(uuid, text, int) from public;

grant execute on function public.enable_product_variants_draft(uuid, text[]) to authenticated;
grant execute on function public.save_product_variant_stocks(uuid, jsonb) to authenticated;
grant execute on function public.activate_product_variants(uuid) to authenticated;
grant execute on function public.adjust_product_variant_stock(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
