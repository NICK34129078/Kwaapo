-- =============================================================================
-- Kwaapo: order payment integrity — blokkeer client-wijzigingen aan betaalvelden
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor.
--
-- Waarom trigger i.p.v. kolom-RLS:
-- Postgres RLS werkt per rie, niet per kolom. Een BEFORE UPDATE trigger is de
-- kleinste veilige oplossing: sellers houden directe fulfillment-updates via
-- Supabase client; payment/financial velden alleen via service_role (Worker).
-- =============================================================================

create or replace function public.enforce_order_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt()->>'role', '');
begin
  -- Worker / PostgREST service role
  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'orders: authentication required';
  end if;

  -- Buyers: no direct updates (RLS has no buyer UPDATE policy; defense in depth)
  if auth.uid() = old.buyer_id and auth.uid() is distinct from old.seller_id then
    raise exception 'orders: buyers cannot update orders';
  end if;

  if auth.uid() = old.seller_id then
    -- Payment / Stripe / financial / identity
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

    -- Stock reservation lifecycle (Worker only)
    if new.stock_reserved_at is distinct from old.stock_reserved_at then
      raise exception 'orders: sellers cannot change stock_reserved_at';
    end if;
    if new.stock_released_at is distinct from old.stock_released_at then
      raise exception 'orders: sellers cannot change stock_released_at';
    end if;
    if new.stock_committed_at is distinct from old.stock_committed_at then
      raise exception 'orders: sellers cannot change stock_committed_at';
    end if;

    -- Buyer checkout / shipping capture (set at order creation by buyer)
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

    -- Status: allow fulfillment transitions only (not payment states)
    if new.status is distinct from old.status
       and new.status in ('paid', 'pending_payment', 'refunded') then
      raise exception 'orders: sellers cannot set payment-related status';
    end if;

    -- Allowed seller fields: status (fulfillment), shipping_status, tracking_code,
    -- shipped_at, seller_note — no further checks needed.
    return new;
  end if;

  raise exception 'orders: update not permitted';
end;
$$;

drop trigger if exists enforce_order_update_integrity_trigger on public.orders;

create trigger enforce_order_update_integrity_trigger
  before update on public.orders
  for each row
  execute function public.enforce_order_update_integrity();

comment on function public.enforce_order_update_integrity() is
  'Blocks authenticated sellers/buyers from mutating payment and financial order fields.';

-- Re-affirm RLS policies (no buyer UPDATE; seller SELECT + limited UPDATE)
alter table public.orders enable row level security;

drop policy if exists "Buyers select own orders" on public.orders;
create policy "Buyers select own orders"
  on public.orders
  for select
  using (auth.uid() = buyer_id);

drop policy if exists "Sellers select own orders" on public.orders;
create policy "Sellers select own orders"
  on public.orders
  for select
  using (auth.uid() = seller_id);

drop policy if exists "Buyers insert own orders" on public.orders;
create policy "Buyers insert own orders"
  on public.orders
  for insert
  with check (auth.uid() = buyer_id);

drop policy if exists "Sellers update own order status" on public.orders;
drop policy if exists "Sellers update own order fulfillment" on public.orders;
create policy "Sellers update own order fulfillment"
  on public.orders
  for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
