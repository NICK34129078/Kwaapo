-- Order foundation (no payments/checkout yet)

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending_payment',
  subtotal_amount numeric(10, 2) not null check (subtotal_amount >= 0),
  platform_fee_amount numeric(10, 2) not null check (platform_fee_amount >= 0),
  seller_amount numeric(10, 2) not null check (seller_amount >= 0),
  created_at timestamptz not null default now(),
  constraint orders_status_check check (
    status in (
      'pending_payment',
      'paid',
      'processing',
      'shipped',
      'completed',
      'cancelled',
      'refunded'
    )
  )
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  size text null,
  created_at timestamptz not null default now()
);

create index if not exists orders_buyer_created_idx
  on public.orders (buyer_id, created_at desc);

create index if not exists orders_seller_created_idx
  on public.orders (seller_id, created_at desc);

create index if not exists orders_seller_status_idx
  on public.orders (seller_id, status, created_at desc);

create index if not exists order_items_order_idx
  on public.order_items (order_id);

create index if not exists order_items_product_idx
  on public.order_items (product_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

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
create policy "Sellers update own order status"
  on public.orders
  for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

drop policy if exists "Participants select order items" on public.order_items;
create policy "Participants select order items"
  on public.order_items
  for select
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

drop policy if exists "Buyers insert items for own orders" on public.order_items;
create policy "Buyers insert items for own orders"
  on public.order_items
  for insert
  with check (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.buyer_id = auth.uid()
    )
  );

comment on table public.orders is
  'Order foundation records. Payment providers are not connected yet.';

comment on table public.order_items is
  'Line items for orders. No checkout/payment settlement yet.';
