-- Bedrijven-tab: geverifieerde verkopers met minstens één live shop-product.
-- Renumbered from 0039 → 0054: duplicate version conflict with 0039_feed_interest_ranking.sql.

create or replace function public.get_shop_live_seller_profiles(
  p_search_query text default null,
  p_limit integer default 40
)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  business_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with live_sellers as (
    select distinct pr.owner_id
    from public.products pr
    where pr.is_active = true
      and pr.stock > 0
      and pr.moderation_status = 'approved'
      and public.is_verified_payout_ready_seller(pr.owner_id)
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.business_name
  from public.profiles p
  inner join live_sellers ls on ls.owner_id = p.id
  where (
    p_search_query is null
    or trim(p_search_query) = ''
    or p.username ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
    or coalesce(p.display_name, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
    or coalesce(p.business_name, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
  )
  order by p.business_name nulls last, p.display_name nulls last, p.username nulls last
  limit least(greatest(coalesce(p_limit, 40), 1), 100);
$$;

comment on function public.get_shop_live_seller_profiles(text, integer) is
  'Verified sellers with at least one live approved in-stock product (Bedrijven tab).';

revoke all on function public.get_shop_live_seller_profiles(text, integer) from public;
grant execute on function public.get_shop_live_seller_profiles(text, integer) to authenticated, anon;
