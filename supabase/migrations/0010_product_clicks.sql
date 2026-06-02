-- Product click tracking (shop CTA). Run in Supabase SQL editor if migrations CLI niet gebruikt wordt.

create table if not exists public.product_clicks (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  viewer_id uuid null references auth.users (id) on delete set null,
  creator_id text not null,
  product_url text not null,
  source text not null default 'feed',
  created_at timestamptz not null default now()
);

create index if not exists product_clicks_post_created_idx
  on public.product_clicks (post_id, created_at desc);

create index if not exists product_clicks_creator_created_idx
  on public.product_clicks (creator_id, created_at desc);

create index if not exists product_clicks_viewer_created_idx
  on public.product_clicks (viewer_id, created_at desc);

alter table public.product_clicks enable row level security;

create policy "Users insert own product clicks"
  on public.product_clicks
  for insert
  to authenticated
  with check (viewer_id = auth.uid());

create policy "Users select own product clicks"
  on public.product_clicks
  for select
  to authenticated
  using (viewer_id = auth.uid());

create policy "Creators select product clicks on own posts"
  on public.product_clicks
  for select
  to authenticated
  using (creator_id = auth.uid()::text);

create or replace function public.record_product_click(
  p_post_id uuid,
  p_source text default 'feed'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text;
  v_post record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_source := left(coalesce(nullif(trim(p_source), ''), 'feed'), 40);

  select
    p.id,
    p.user_id,
    p.product_url,
    p.is_shop_post,
    p.is_deleted
  into v_post
  from public.posts p
  where p.id = p_post_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'post_not_found');
  end if;

  if coalesce(v_post.is_deleted, false) then
    return jsonb_build_object('success', false, 'reason', 'post_deleted');
  end if;

  if v_post.product_url is null or length(trim(v_post.product_url)) = 0 then
    return jsonb_build_object('success', false, 'reason', 'no_product_url');
  end if;

  insert into public.product_clicks (
    post_id,
    viewer_id,
    creator_id,
    product_url,
    source
  )
  values (
    p_post_id,
    v_user_id,
    v_post.user_id,
    trim(v_post.product_url),
    v_source
  );

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'creator_id', v_post.user_id
  );
end;
$$;

revoke all on function public.record_product_click(uuid, text) from public;
grant execute on function public.record_product_click(uuid, text) to authenticated;

notify pgrst, 'reload schema';
