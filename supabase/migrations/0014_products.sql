-- Business shop products (marketplace foundation — no payments/orders yet)

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  category text null,
  brand text null,
  stock int not null default 0 check (stock >= 0),
  images jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists products_owner_created_idx
  on public.products (owner_id, created_at desc);

create index if not exists products_owner_active_idx
  on public.products (owner_id, is_active, created_at desc);

alter table public.products enable row level security;

create policy "Public read active products"
  on public.products
  for select
  using (is_active = true);

create policy "Owners read own products"
  on public.products
  for select
  using (auth.uid() = owner_id);

create policy "Owners insert own products"
  on public.products
  for insert
  with check (auth.uid() = owner_id);

create policy "Owners update own products"
  on public.products
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Owners delete own products"
  on public.products
  for delete
  using (auth.uid() = owner_id);

comment on table public.products is
  'Business shop catalog items. No checkout/payments in this phase.';

-- Storage bucket for product images (public read)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "Public read product images"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

create policy "Owners upload product images"
  on storage.objects
  for insert
  with check (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Owners update product images"
  on storage.objects
  for update
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Owners delete product images"
  on storage.objects
  for delete
  using (
    bucket_id = 'product-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
