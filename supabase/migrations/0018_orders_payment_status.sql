-- Payment status foundation. No Stripe/payment provider integration yet.

alter table public.orders
  add column if not exists payment_status text not null default 'unpaid';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_payment_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_status_check check (
        payment_status in ('unpaid', 'paid', 'failed', 'refunded')
      );
  end if;
end $$;

create index if not exists orders_seller_payment_status_idx
  on public.orders (seller_id, payment_status, created_at desc);

create index if not exists orders_buyer_payment_status_idx
  on public.orders (buyer_id, payment_status, created_at desc);

comment on column public.orders.payment_status is
  'Payment lifecycle for future payment provider integration. Independent from shipping_status.';
