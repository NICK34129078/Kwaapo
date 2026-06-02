-- Link posts/reels to catalog products (public.products)

alter table public.posts
  add column if not exists product_id uuid null references public.products (id) on delete set null;

create index if not exists posts_product_id_idx
  on public.posts (product_id)
  where product_id is not null;

comment on column public.posts.product_id is
  'Optional link to public.products. is_shop_post when product_id or product_url is set.';
