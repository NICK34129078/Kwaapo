-- Product style tags for personalized shop ranking (mirrors post hashtag prefs).

alter table public.products
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists products_tags_gin_idx
  on public.products using gin (tags);

create index if not exists products_active_created_idx
  on public.products (is_active, created_at desc)
  where is_active = true;

comment on column public.products.tags is
  'Lowercase style tags without # (max 10). Used by get_personalized_shop_products.';
