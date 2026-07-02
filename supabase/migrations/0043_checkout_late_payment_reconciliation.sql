-- =============================================================================
-- 0043_checkout_late_payment_reconciliation.sql
-- Late Stripe checkout.session.completed after stock was released (expired/cancel).
-- Adds fulfillment tracking + atomic reconcile RPC (product + variant stock).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fulfillment + reconciliation audit columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists fulfillment_status text null,
  add column if not exists payment_reconciled_at timestamptz null,
  add column if not exists fulfillment_exception_at timestamptz null,
  add column if not exists refund_requested_at timestamptz null,
  add column if not exists refund_completed_at timestamptz null,
  add column if not exists stripe_refund_id text null;

alter table public.orders
  drop constraint if exists orders_fulfillment_status_check;

alter table public.orders
  add constraint orders_fulfillment_status_check check (
    fulfillment_status is null
    or fulfillment_status in (
      'committed',
      'reconciled',
      'stock_unavailable',
      'refund_pending',
      'refunded',
      'manual_review'
    )
  );

create index if not exists orders_fulfillment_status_idx
  on public.orders (fulfillment_status, payment_status, created_at desc)
  where fulfillment_status is not null;

comment on column public.orders.fulfillment_status is
  'Fulfillment lifecycle separate from payment_status; set by Worker webhook reconciliation.';

comment on column public.orders.payment_reconciled_at is
  'When a late paid webhook successfully re-committed stock after a prior release.';

comment on column public.orders.fulfillment_exception_at is
  'When paid was recorded but stock could not be committed (e.g. sold out).';

comment on column public.orders.refund_requested_at is
  'When an automatic Stripe refund was initiated for stock_unavailable orders.';

comment on column public.orders.refund_completed_at is
  'When auto-refund completed (charge.refunded webhook applied).';

comment on column public.orders.stripe_refund_id is
  'Stripe Refund id (re_...) for idempotency / support.';

-- ---------------------------------------------------------------------------
-- 2. reconcile_product_stock_for_paid_order
--    Atomically re-reserve + commit when stock was previously released.
--    Idempotent: stock_committed_at already set → already_committed.
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_product_stock_for_paid_order(p_order_id uuid)
returns jsonb
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
begin
  if p_order_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_order_id');
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
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  if ord.stock_committed_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_committed');
  end if;

  -- Active reservation without release: normal commit path should have handled this.
  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return jsonb_build_object('ok', false, 'reason', 'active_reservation');
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
      return jsonb_build_object('ok', false, 'reason', 'stock_unavailable');
    end if;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready then
      if item.product_variant_id is null then
        return jsonb_build_object('ok', false, 'reason', 'stock_unavailable');
      end if;

      select pv.id, pv.product_id, pv.option_value, pv.stock, pv.seller_id
      into v_variant
      from public.product_variants pv
      where pv.id = item.product_variant_id
        and pv.product_id = item.product_id
        and pv.is_active = true
      for update;

      if not found then
        return jsonb_build_object('ok', false, 'reason', 'stock_unavailable');
      end if;

      v_before := greatest(0, coalesce(v_variant.stock, 0));

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock - item.quantity
      where id = v_variant.id
        and stock >= item.quantity;

      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        return jsonb_build_object('ok', false, 'reason', 'stock_unavailable');
      end if;

      select stock into v_after from public.product_variants where id = v_variant.id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_before,
        v_after,
        'Late betaling: maat ' || coalesce(v_variant.option_value, item.selected_variant_value, '?') || ' opnieuw gereserveerd',
        item.product_variant_id
      );
    else
      v_before := greatest(0, coalesce(v_product.stock, 0));

      perform set_config('app.allow_stock_update', 'true', true);

      update public.products
      set stock = stock - item.quantity
      where id = item.product_id
        and stock >= item.quantity;

      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        return jsonb_build_object('ok', false, 'reason', 'stock_unavailable');
      end if;

      select stock into v_after from public.products where id = item.product_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_before,
        v_after,
        'Late betaling: opnieuw gereserveerd',
        null
      );
    end if;
  end loop;

  update public.orders
  set
    stock_reserved_at = coalesce(stock_reserved_at, now()),
    stock_released_at = null,
    stock_committed_at = now()
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'reason', 'reconciled');
end;
$$;

comment on function public.reconcile_product_stock_for_paid_order(uuid) is
  'Re-commit stock after checkout.session.completed when reservation was previously released. Idempotent.';

revoke all on function public.reconcile_product_stock_for_paid_order(uuid) from public;
revoke all on function public.reconcile_product_stock_for_paid_order(uuid) from anon;
revoke all on function public.reconcile_product_stock_for_paid_order(uuid) from authenticated;
grant execute on function public.reconcile_product_stock_for_paid_order(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. restore_product_stock_for_refunded_order — never_committed is OK
--    When stock was never committed (e.g. stock_unavailable auto-refund),
--    refund completion must not fail on stock restore.
-- ---------------------------------------------------------------------------
create or replace function public.restore_product_stock_for_refunded_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_product record;
  v_variant record;
  v_before int;
  v_after int;
  v_owner uuid;
  v_reason text;
begin
  if p_order_id is null then
    return jsonb_build_object('restored', false, 'reason', 'invalid_order_id');
  end if;

  select
    id,
    shipping_status,
    stock_restored_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('restored', false, 'reason', 'order_not_found');
  end if;

  if ord.stock_restored_at is not null then
    return jsonb_build_object('restored', false, 'reason', 'already_restored');
  end if;

  if coalesce(ord.shipping_status, 'not_shipped') <> 'not_shipped' then
    return jsonb_build_object(
      'restored', false,
      'reason', 'already_shipped_return_required'
    );
  end if;

  if ord.stock_committed_at is null then
    update public.orders
    set stock_restored_at = coalesce(stock_restored_at, now())
    where id = p_order_id;
    return jsonb_build_object('restored', true, 'reason', 'never_committed');
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

    if not found then
      return jsonb_build_object('restored', false, 'reason', 'product_not_found');
    end if;

    v_owner := v_product.owner_id;

    if v_product.uses_variants
       and v_product.variants_ready
       and item.product_variant_id is not null then
      select id, stock, option_value
      into v_variant
      from public.product_variants
      where id = item.product_variant_id
      for update;

      if not found then
        return jsonb_build_object('restored', false, 'reason', 'variant_not_found');
      end if;

      v_before := greatest(0, v_variant.stock);

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock + item.quantity
      where id = v_variant.id;

      select stock into v_after from public.product_variants where id = v_variant.id;

      v_reason := 'Maat ' || v_variant.option_value || ': terugbetaling';

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
        'Terugbetaling',
        null
      );
    end if;
  end loop;

  update public.orders
  set stock_restored_at = now()
  where id = p_order_id;

  return jsonb_build_object('restored', true, 'reason', null);
end;
$$;

comment on function public.restore_product_stock_for_refunded_order(uuid) is
  'Restore stock once for pre-ship full refunds. never_committed succeeds when stock was never sold.';
