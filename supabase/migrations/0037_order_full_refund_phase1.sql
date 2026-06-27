-- =============================================================================
-- 0037_order_full_refund_phase1.sql
-- Fase 1: volledige refund-flow (webhook-gedreven, geen partial/disputes UI).
-- Run via: supabase db push  OR  paste in Supabase SQL Editor vóór worker deploy.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Stripe webhook event ledger (idempotency)
-- ---------------------------------------------------------------------------
create table if not exists public.order_payment_events (
  stripe_event_id text primary key,
  order_id uuid null references public.orders (id) on delete set null,
  event_type text not null,
  stripe_object_id text null,
  amount_cents int null,
  currency text not null default 'eur',
  refund_status text null,
  processed_at timestamptz not null default now(),
  payload_summary jsonb null
);

create index if not exists order_payment_events_order_idx
  on public.order_payment_events (order_id, processed_at desc);

comment on table public.order_payment_events is
  'Processed Stripe payment/refund webhooks only — row inserted after full DB success (P1-safe). Service role only.';

comment on column public.order_payment_events.processed_at is
  'Set when the full refund/order side-effects succeeded; not when the webhook was merely received.';

alter table public.order_payment_events enable row level security;

-- No policies: authenticated users cannot read/write.

-- ---------------------------------------------------------------------------
-- 2. Order refund + return basis columns
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists stripe_charge_id text null,
  add column if not exists refunded_at timestamptz null,
  add column if not exists refunded_amount_cents int null,
  add column if not exists refund_requires_return boolean not null default false,
  add column if not exists return_approved_at timestamptz null,
  add column if not exists returned_received_at timestamptz null,
  add column if not exists stock_restored_at timestamptz null;

create index if not exists orders_stripe_charge_id_idx
  on public.orders (stripe_charge_id)
  where stripe_charge_id is not null;

comment on column public.orders.stripe_charge_id is
  'Stripe Charge id (ch_...) for refunds and support traceability.';

comment on column public.orders.refund_requires_return is
  'True when refund processed while shipping_status was shipped or delivered.';

comment on column public.orders.stock_restored_at is
  'When stock was restored (pre-ship refund or future return flow). Idempotency guard.';

-- ---------------------------------------------------------------------------
-- 3. Notification types: order_refunded
-- ---------------------------------------------------------------------------
alter table public.seller_notifications
  drop constraint if exists seller_notifications_type_check;

alter table public.seller_notifications
  add constraint seller_notifications_type_check check (
    notification_type in ('new_paid_order', 'order_refunded')
  );

alter table public.buyer_notifications
  drop constraint if exists buyer_notifications_type_check;

alter table public.buyer_notifications
  add constraint buyer_notifications_type_check check (
    notification_type in ('order_shipped', 'order_refunded')
  );

-- ---------------------------------------------------------------------------
-- 4. restore_product_stock_for_refunded_order
--    Only when shipping_status = not_shipped; idempotent via stock_restored_at.
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
    return jsonb_build_object('restored', false, 'reason', 'stock_not_committed');
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

revoke all on function public.restore_product_stock_for_refunded_order(uuid) from public;
grant execute on function public.restore_product_stock_for_refunded_order(uuid) to service_role;

comment on function public.restore_product_stock_for_refunded_order(uuid) is
  'Restore stock once for pre-ship full refunds. No-op when already shipped.';

-- ---------------------------------------------------------------------------
-- 5. apply_full_order_refund — single transaction; event ledger LAST (P1-safe)
-- ---------------------------------------------------------------------------
create or replace function public.apply_full_order_refund(
  p_order_id uuid,
  p_stripe_event_id text,
  p_amount_refunded_cents int,
  p_charge_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  v_subtotal_cents int;
  v_requires_return boolean;
  v_stock jsonb;
  v_stock_restored boolean := false;
  v_restore_reason text;
begin
  if p_order_id is null or p_stripe_event_id is null or length(trim(p_stripe_event_id)) = 0 then
    return jsonb_build_object(
      'duplicate', false,
      'applied', false,
      'reason', 'invalid_arguments'
    );
  end if;

  -- Idempotency: only successfully processed events are stored (insert happens at end).
  if exists (
    select 1
    from public.order_payment_events e
    where e.stripe_event_id = p_stripe_event_id
  ) then
    return jsonb_build_object('duplicate', true, 'applied', false);
  end if;

  select
    id,
    payment_status,
    status,
    shipping_status,
    subtotal_amount,
    refund_requires_return,
    stock_restored_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'duplicate', false,
      'applied', false,
      'reason', 'order_not_found'
    );
  end if;

  if ord.payment_status = 'refunded' or ord.status = 'refunded' then
    insert into public.order_payment_events (
      stripe_event_id,
      order_id,
      event_type,
      stripe_object_id,
      amount_cents,
      payload_summary
    )
    values (
      p_stripe_event_id,
      p_order_id,
      'charge.refunded',
      p_charge_id,
      p_amount_refunded_cents,
      jsonb_build_object(
        'charge_id', p_charge_id,
        'amount_refunded_cents', p_amount_refunded_cents,
        'note', 'order_already_refunded'
      )
    )
    on conflict (stripe_event_id) do nothing;

    return jsonb_build_object(
      'duplicate', true,
      'applied', false,
      'reason', 'already_refunded'
    );
  end if;

  if ord.payment_status <> 'paid' then
    return jsonb_build_object(
      'duplicate', false,
      'applied', false,
      'reason', 'not_paid'
    );
  end if;

  v_subtotal_cents := round(coalesce(ord.subtotal_amount, 0) * 100)::int;

  if p_amount_refunded_cents is null or p_amount_refunded_cents < v_subtotal_cents then
    return jsonb_build_object(
      'duplicate', false,
      'applied', false,
      'reason', 'not_full_refund'
    );
  end if;

  v_requires_return := coalesce(ord.shipping_status, 'not_shipped') in ('shipped', 'delivered');

  if not v_requires_return then
    v_stock := public.restore_product_stock_for_refunded_order(p_order_id);
    v_stock_restored := coalesce((v_stock->>'restored')::boolean, false);
    v_restore_reason := v_stock->>'reason';

    if v_stock_restored is not true then
      raise exception 'refund_stock_restore_failed:%',
        coalesce(v_restore_reason, 'unknown')
        using errcode = 'P0001';
    end if;
  end if;

  update public.orders
  set
    payment_status = 'refunded',
    status = 'refunded',
    refunded_at = coalesce(refunded_at, now()),
    refunded_amount_cents = p_amount_refunded_cents,
    refund_requires_return = v_requires_return,
    stripe_charge_id = coalesce(stripe_charge_id, nullif(trim(p_charge_id), ''))
  where id = p_order_id;

  insert into public.order_payment_events (
    stripe_event_id,
    order_id,
    event_type,
    stripe_object_id,
    amount_cents,
    payload_summary
  )
  values (
    p_stripe_event_id,
    p_order_id,
    'charge.refunded',
    p_charge_id,
    p_amount_refunded_cents,
    jsonb_build_object(
      'charge_id', p_charge_id,
      'amount_refunded_cents', p_amount_refunded_cents,
      'refund_requires_return', v_requires_return,
      'stock_restored', v_stock_restored
    )
  );

  return jsonb_build_object(
    'duplicate', false,
    'applied', true,
    'refund_requires_return', v_requires_return,
    'stock_restored', v_stock_restored,
    'stock_restore_reason', case
      when v_requires_return then 'already_shipped_return_required'
      else null
    end
  );
end;
$$;

revoke all on function public.apply_full_order_refund(uuid, text, int, text) from public;
grant execute on function public.apply_full_order_refund(uuid, text, int, text) to service_role;

comment on function public.apply_full_order_refund(uuid, text, int, text) is
  'Atomic full refund: stock restore (pre-ship) → order refunded → event ledger insert. Rolls back on stock failure.';

-- ---------------------------------------------------------------------------
-- 6. Integrity guard — block seller mutations on refund/return/stock fields
-- ---------------------------------------------------------------------------
create or replace function public.enforce_order_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt()->>'role', '');
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'orders: authentication required';
  end if;

  if auth.uid() = old.buyer_id and auth.uid() is distinct from old.seller_id then
    raise exception 'orders: buyers cannot update orders';
  end if;

  if auth.uid() = old.seller_id then
    if new.payment_status is distinct from old.payment_status then
      raise exception 'orders: sellers cannot change payment_status';
    end if;
    if new.paid_at is distinct from old.paid_at then
      raise exception 'orders: sellers cannot change paid_at';
    end if;
    if new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id then
      raise exception 'orders: sellers cannot change stripe_checkout_session_id';
    end if;
    if new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id then
      raise exception 'orders: sellers cannot change stripe_payment_intent_id';
    end if;
    if new.stripe_charge_id is distinct from old.stripe_charge_id then
      raise exception 'orders: sellers cannot change stripe_charge_id';
    end if;
    if new.refunded_at is distinct from old.refunded_at then
      raise exception 'orders: sellers cannot change refunded_at';
    end if;
    if new.refunded_amount_cents is distinct from old.refunded_amount_cents then
      raise exception 'orders: sellers cannot change refunded_amount_cents';
    end if;
    if new.refund_requires_return is distinct from old.refund_requires_return then
      raise exception 'orders: sellers cannot change refund_requires_return';
    end if;
    if new.return_approved_at is distinct from old.return_approved_at then
      raise exception 'orders: sellers cannot change return_approved_at';
    end if;
    if new.returned_received_at is distinct from old.returned_received_at then
      raise exception 'orders: sellers cannot change returned_received_at';
    end if;
    if new.stock_restored_at is distinct from old.stock_restored_at then
      raise exception 'orders: sellers cannot change stock_restored_at';
    end if;
    if new.subtotal_amount is distinct from old.subtotal_amount then
      raise exception 'orders: sellers cannot change subtotal_amount';
    end if;
    if new.platform_fee_amount is distinct from old.platform_fee_amount then
      raise exception 'orders: sellers cannot change platform_fee_amount';
    end if;
    if new.seller_amount is distinct from old.seller_amount then
      raise exception 'orders: sellers cannot change seller_amount';
    end if;
    if new.buyer_id is distinct from old.buyer_id then
      raise exception 'orders: sellers cannot change buyer_id';
    end if;
    if new.seller_id is distinct from old.seller_id then
      raise exception 'orders: sellers cannot change seller_id';
    end if;
    if new.id is distinct from old.id then
      raise exception 'orders: sellers cannot change order id';
    end if;
    if new.stock_reserved_at is distinct from old.stock_reserved_at then
      raise exception 'orders: sellers cannot change stock_reserved_at';
    end if;
    if new.stock_released_at is distinct from old.stock_released_at then
      raise exception 'orders: sellers cannot change stock_released_at';
    end if;
    if new.stock_committed_at is distinct from old.stock_committed_at then
      raise exception 'orders: sellers cannot change stock_committed_at';
    end if;
    if new.buyer_email is distinct from old.buyer_email then
      raise exception 'orders: sellers cannot change buyer_email';
    end if;
    if new.buyer_full_name is distinct from old.buyer_full_name then
      raise exception 'orders: sellers cannot change buyer_full_name';
    end if;
    if new.shipping_country is distinct from old.shipping_country then
      raise exception 'orders: sellers cannot change shipping_country';
    end if;
    if new.shipping_city is distinct from old.shipping_city then
      raise exception 'orders: sellers cannot change shipping_city';
    end if;
    if new.shipping_postal_code is distinct from old.shipping_postal_code then
      raise exception 'orders: sellers cannot change shipping_postal_code';
    end if;
    if new.shipping_street is distinct from old.shipping_street then
      raise exception 'orders: sellers cannot change shipping_street';
    end if;
    if new.shipping_house_number is distinct from old.shipping_house_number then
      raise exception 'orders: sellers cannot change shipping_house_number';
    end if;
    if new.shipping_phone is distinct from old.shipping_phone then
      raise exception 'orders: sellers cannot change shipping_phone';
    end if;
    if new.status is distinct from old.status
       and new.status in ('paid', 'pending_payment', 'refunded') then
      raise exception 'orders: sellers cannot set payment-related status';
    end if;
    return new;
  end if;

  raise exception 'orders: update not permitted';
end;
$$;

notify pgrst, 'reload schema';
