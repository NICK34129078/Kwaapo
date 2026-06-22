-- =============================================================================
-- personalized_shop_products_RUN_IN_DASHBOARD.sql
--
-- Run in Supabase SQL Editor (dashboard only).
--
-- Adds product tags (if missing) and creates get_personalized_shop_products.
-- Does NOT replace fetchShopProducts — app uses RPC for logged-in browse,
-- with fallback to the existing created_at shop query.
--
-- BACKUP: export public.products before running if you want a snapshot.
-- SAFE: uses IF NOT EXISTS / CREATE OR REPLACE only.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Product tags column
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists products_tags_gin_idx
  on public.products using gin (tags);

create index if not exists products_active_created_idx
  on public.products (is_active, created_at desc)
  where is_active = true;

comment on column public.products.tags is
  'Lowercase style tags without # (max 10). Used by get_personalized_shop_products.';

-- ---------------------------------------------------------------------------
-- 2. Personalized shop RPC
-- ---------------------------------------------------------------------------
drop function if exists public.get_personalized_shop_products(integer, uuid[]);

create function public.get_personalized_shop_products(
  p_limit                  integer   default 30,
  p_exclude_product_ids    uuid[]    default '{}'::uuid[]
)
returns table(
  id              uuid,
  owner_id        uuid,
  name            text,
  description     text,
  price           numeric,
  category        text,
  brand           text,
  stock           integer,
  images          jsonb,
  sizes           jsonb,
  is_active       boolean,
  created_at      timestamptz,
  tags            text[],
  shop_score      numeric,
  relevant_tags   text[]
)
language sql
stable
security definer
set search_path = public
as $function$
  with current_user_id as (
    select auth.uid() as user_id
  ),

  effective_limit as (
    select least(greatest(coalesce(p_limit, 30), 1), 120) as lim
  ),

  untagged_slot_limit as (
    -- ~1 no-tag product per 9 tagged, max 4 per batch
    select greatest(
      1,
      least(4, ((select lim from effective_limit) + 8) / 9)
    )::integer as slots
  ),

  product_popularity as (
    select
      pr.id as product_id,
      coalesce(oi.order_count, 0)::integer   as order_count,
      coalesce(pc.click_count, 0)::integer   as click_count
    from public.products pr
    left join lateral (
      select count(*)::integer as order_count
      from public.order_items oi
      where oi.product_id = pr.id
    ) oi on true
    left join lateral (
      select count(*)::integer as click_count
      from public.posts po
      join public.product_clicks clk on clk.post_id = po.id
      where po.product_id = pr.id
    ) pc on true
  ),

  scored as (
    select
      pr.id,
      pr.owner_id,
      pr.name,
      pr.description,
      pr.price,
      pr.category,
      pr.brand,
      pr.stock,
      pr.images,
      pr.sizes,
      pr.is_active,
      pr.created_at,
      coalesce(pr.tags, '{}'::text[])                         as tags,
      cardinality(coalesce(pr.tags, '{}'::text[]))            as tag_count,
      (f.follower_id is not null)                             as is_followed,
      coalesce(ucp.score, 0)                                  as creator_affinity,
      coalesce(sum(utp.score), 0)                             as tag_pref_sum,
      coalesce(array_agg(distinct utp.tag)
        filter (where utp.tag is not null), '{}'::text[])     as relevant_tags,
      coalesce(pp.order_count, 0)                             as order_count,
      coalesce(pp.click_count, 0)                             as click_count,

      -- A. interest_tag_score (main factor, clamped)
      (
        1.0
        + least(greatest(coalesce(sum(utp.score), 0), 0), 60) * 0.15
      )                                                       as interest_tag_score,

      -- B. recency_score (light; decays over ~5 days)
      (
        1.0
        + greatest(
            0,
            5 - extract(epoch from (now() - pr.created_at)) / 86400
          ) / 10.0
      )                                                       as recency_score,

      -- C. popularity_score (real metrics only; 1.0 if none)
      (
        1.0
        + least(coalesce(pp.order_count, 0), 20) * 0.05
        + least(coalesce(pp.click_count, 0), 50) * 0.02
      )                                                       as popularity_score,

      -- D. seller_affinity_score (only when product has tags)
      (
        case
          when cardinality(coalesce(pr.tags, '{}'::text[])) > 0 then
            1.0 + least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.02
          else 1.0
        end
      )                                                       as seller_affinity_score,

      -- E. discovery_mix (slight boost for low-interest tagged + jitter)
      (
        case
          when cardinality(coalesce(pr.tags, '{}'::text[])) = 0 then 1.0
          when coalesce(sum(utp.score), 0) < 3 then 1.08 + random() * 0.07
          else 1.0 + random() * 0.03
        end
      )                                                       as discovery_mix

    from public.products pr
    cross join current_user_id cu
    left join public.user_tag_preferences utp
      on utp.user_id = cu.user_id
     and utp.tag = any(coalesce(pr.tags, '{}'::text[]))
    left join public.user_creator_preferences ucp
      on ucp.user_id = cu.user_id
     and ucp.creator_id = pr.owner_id::text
    left join public.follows f
      on f.follower_id = cu.user_id
     and f.following_id = pr.owner_id
    left join product_popularity pp
      on pp.product_id = pr.id
    where pr.is_active = true
      and cu.user_id is not null
      and not (pr.id = any(coalesce(p_exclude_product_ids, '{}'::uuid[])))
    group by
      pr.id, pr.owner_id, pr.name, pr.description, pr.price, pr.category,
      pr.brand, pr.stock, pr.images, pr.sizes, pr.is_active, pr.created_at,
      pr.tags, f.follower_id, ucp.score, pp.order_count, pp.click_count
  ),

  with_shop_score as (
    select
      s.*,
      case
        when s.tag_count > 0 then
          s.interest_tag_score
          * s.recency_score
          * s.popularity_score
          * s.seller_affinity_score
          * s.discovery_mix
        else
          -- No-tag: dampened; seller context only
          (
            0.2
            + case when s.is_followed then 0.35 else 0 end
            + case when s.creator_affinity >= 15 then 0.2 else 0 end
          )
          * (0.5 + random() * 0.5)
      end as shop_score
    from scored s
  ),

  tagged_ranked as (
    select
      w.id,
      w.owner_id,
      w.name,
      w.description,
      w.price,
      w.category,
      w.brand,
      w.stock,
      w.images,
      w.sizes,
      w.is_active,
      w.created_at,
      w.tags,
      w.shop_score,
      w.relevant_tags
    from with_shop_score w
    where w.tag_count > 0
    order by w.shop_score desc, w.created_at desc
    limit (select lim from effective_limit)
  ),

  untagged_fallback as (
    select
      w.id,
      w.owner_id,
      w.name,
      w.description,
      w.price,
      w.category,
      w.brand,
      w.stock,
      w.images,
      w.sizes,
      w.is_active,
      w.created_at,
      w.tags,
      w.shop_score,
      w.relevant_tags
    from with_shop_score w
    where w.tag_count = 0
      and (
        w.is_followed
        or w.creator_affinity >= 15
        or random() < 0.02
      )
    order by w.shop_score desc, random()
    limit (select slots from untagged_slot_limit)
  )

  select * from tagged_ranked
  union all
  select * from untagged_fallback
$function$;

revoke all on function public.get_personalized_shop_products(integer, uuid[]) from public;
grant execute on function public.get_personalized_shop_products(integer, uuid[]) to authenticated;

comment on function public.get_personalized_shop_products(integer, uuid[]) is
  'Personalized shop ranking via user_tag_preferences, recency, popularity, seller affinity, controlled no-tag fallback.';

notify pgrst, 'reload schema';

-- =============================================================================
-- Manual tag examples (optional — run separately for test data):
--   update public.products set tags = '{summer,beach,casual}' where ...;
--   update public.products set tags = '{oldmoney,formal,minimal}' where ...;
-- =============================================================================
