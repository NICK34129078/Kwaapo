-- Checkout/shipping information for pending orders.

alter table public.orders
  add column if not exists buyer_email text null,
  add column if not exists buyer_full_name text null,
  add column if not exists shipping_country text null,
  add column if not exists shipping_city text null,
  add column if not exists shipping_postal_code text null,
  add column if not exists shipping_street text null,
  add column if not exists shipping_house_number text null,
  add column if not exists shipping_phone text null,
  add column if not exists seller_note text null,
  add column if not exists shipping_status text not null default 'not_shipped',
  add column if not exists tracking_code text null,
  add column if not exists shipped_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_shipping_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_shipping_status_check check (
        shipping_status in ('not_shipped', 'shipped', 'delivered')
      );
  end if;
end $$;

create index if not exists orders_seller_shipping_status_idx
  on public.orders (seller_id, shipping_status, created_at desc);

comment on column public.orders.buyer_email is
  'Buyer email captured before payment provider integration.';

comment on column public.orders.buyer_full_name is
  'Buyer full name for seller shipping preparation.';

comment on column public.orders.shipping_status is
  'Shipping lifecycle independent from payment provider settlement.';
