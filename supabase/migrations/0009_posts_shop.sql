-- Shop posts: optional product link on public.posts (phase 1 — no payments)

alter table public.posts
  add column if not exists product_title text null,
  add column if not exists product_url text null,
  add column if not exists product_brand text null,
  add column if not exists product_price_text text null,
  add column if not exists is_shop_post boolean not null default false;

create index if not exists posts_shop_feed_idx
  on public.posts (is_shop_post, created_at desc)
  where is_deleted = false;

comment on column public.posts.is_shop_post is
  'True when product_url is set (shop feed). Set by Worker/app on upload.';
