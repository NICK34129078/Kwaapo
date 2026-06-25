-- =============================================================================
-- shop_categories_and_personalization_RUN_IN_DASHBOARD.sql
--
-- Run in Supabase SQL Editor AFTER stripe_verified_seller_product_guard (uses
-- is_verified_payout_ready_seller).
--
-- Adds main_category / audience / subcategory, shop browse + personalized RPCs.
-- SAFE: IF NOT EXISTS, CREATE OR REPLACE, idempotent grants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Category columns
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists main_category text,
  add column if not exists audience text,
  add column if not exists subcategory text;

comment on column public.products.main_category is
  'Shop hoofdcategorie code: clothing, shoes, accessories, beauty, electronics, home, sports, other';
comment on column public.products.audience is
  'Doelgroep code: men, women, kids, unisex (kleding/schoenen)';
comment on column public.products.subcategory is
  'Subcategorie code, bijv. t_shirts, sneakers';

create index if not exists products_shop_browse_idx
  on public.products (created_at desc, id desc)
  where is_active = true and stock > 0;

create index if not exists products_shop_category_idx
  on public.products (main_category, audience, subcategory)
  where is_active = true and stock > 0;

-- ---------------------------------------------------------------------------
-- 2. Shared: purchasable product filter helper view (inline in RPCs)
--    Requires: is_verified_payout_ready_seller(uuid)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Browse feed — "Alle" + categorieën + zoeken (niet extreem persoonlijk)
-- ---------------------------------------------------------------------------
drop function if exists public.get_shop_browse_products(
  integer, uuid[], text, text, text, text
);

create function public.get_shop_browse_products(
  p_limit                  integer   default 12,
  p_exclude_product_ids    uuid[]    default '{}'::uuid[],
  p_main_category          text      default null,
  p_audience               text      default null,
  p_subcategory            text      default null,
  p_search_query           text      default null
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
  main_category   text,
  audience        text,
  subcategory     text,
  shop_score      numeric,
  feed_bucket     text
)
language sql
stable
security definer
set search_path = public
as $function$
  with effective_limit as (
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim
  ),

  product_popularity as (
    select
      pr.id as product_id,
      coalesce(oi.order_count, 0)::integer as order_count,
      coalesce(pc.click_count, 0)::integer as click_count
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

  filtered as (
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
      coalesce(pr.tags, '{}'::text[]) as tags,
      pr.main_category,
      pr.audience,
      pr.subcategory,
      coalesce(pp.order_count, 0) as order_count,
      coalesce(pp.click_count, 0) as click_count
    from public.products pr
    left join product_popularity pp on pp.product_id = pr.id
    where pr.is_active = true
      and pr.stock > 0
      and public.is_verified_payout_ready_seller(pr.owner_id)
      and not (pr.id = any(coalesce(p_exclude_product_ids, '{}'::uuid[])))
      and (
        p_main_category is null
        or trim(p_main_category) = ''
        or pr.main_category = trim(p_main_category)
        or (
          pr.main_category is null
          and pr.category is not null
          and (
            (trim(p_main_category) = 'clothing' and lower(trim(pr.category)) = 'kleding')
            or (trim(p_main_category) = 'shoes' and lower(trim(pr.category)) = 'schoenen')
            or (trim(p_main_category) = 'accessories' and lower(trim(pr.category)) = 'accessoires')
            or (trim(p_main_category) = 'beauty' and lower(trim(pr.category)) = 'beauty')
            or (trim(p_main_category) = 'electronics' and lower(trim(pr.category)) = 'elektronica')
            or (trim(p_main_category) = 'home' and lower(trim(pr.category)) = 'wonen')
            or (trim(p_main_category) = 'sports' and lower(trim(pr.category)) = 'sport')
            or (trim(p_main_category) = 'other' and lower(trim(pr.category)) = 'overig')
          )
        )
      )
      and (
        p_audience is null
        or trim(p_audience) = ''
        or pr.audience = trim(p_audience)
      )
      and (
        p_subcategory is null
        or trim(p_subcategory) = ''
        or pr.subcategory = trim(p_subcategory)
      )
      and (
        p_search_query is null
        or trim(p_search_query) = ''
        or pr.name ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        or coalesce(pr.brand, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        or coalesce(pr.category, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        or coalesce(pr.description, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        or exists (
          select 1
          from unnest(coalesce(pr.tags, '{}'::text[])) t(tag)
          where t.tag ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        )
      )
  ),

  scored as (
    select
      f.*,
      (
        1.0
        + least(f.order_count, 20) * 0.04
        + least(f.click_count, 50) * 0.015
        + greatest(
            0,
            5 - extract(epoch from (now() - f.created_at)) / 86400
          ) / 12.0
      )::numeric as shop_score,
      'browse'::text as feed_bucket
    from filtered f
  ),

  ranked as (
    select
      s.*,
      row_number() over (
        order by s.shop_score desc, s.created_at desc, s.id desc
      ) as result_rn
    from scored s
  )

  select
    r.id,
    r.owner_id,
    r.name,
    r.description,
    r.price,
    r.category,
    r.brand,
    r.stock,
    r.images,
    r.sizes,
    r.is_active,
    r.created_at,
    r.tags,
    r.main_category,
    r.audience,
    r.subcategory,
    r.shop_score,
    r.feed_bucket
  from ranked r
  cross join effective_limit el
  where r.result_rn <= el.lim
  order by r.shop_score desc, r.created_at desc, r.id desc
$function$;

revoke all on function public.get_shop_browse_products(integer, uuid[], text, text, text, text) from public;
grant execute on function public.get_shop_browse_products(integer, uuid[], text, text, text, text) to authenticated, anon;

comment on function public.get_shop_browse_products(integer, uuid[], text, text, text, text) is
  'Shop browse feed: all purchasable products, light popularity/recency ranking, pagination via exclude IDs.';

-- ---------------------------------------------------------------------------
-- 4. Personalized feed — "Voor jou" with controlled bucket mix
-- ---------------------------------------------------------------------------
drop function if exists public.get_personalized_shop_products(integer, uuid[]);
drop function if exists public.get_personalized_shop_products(
  integer, uuid[], text, text, text, text
);

create function public.get_personalized_shop_products(
  p_limit                  integer   default 12,
  p_exclude_product_ids    uuid[]    default '{}'::uuid[],
  p_main_category          text      default null,
  p_audience               text      default null,
  p_subcategory            text      default null,
  p_search_query           text      default null
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
  main_category   text,
  audience        text,
  subcategory     text,
  shop_score      numeric,
  relevant_tags   text[],
  feed_bucket     text
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
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim
  ),

  bucket_limits as (
    select
      lim,
      greatest(1, round(lim * 0.625))::integer as personal_slots,
      greatest(0, round(lim * 0.175))::integer as similar_slots,
      greatest(0, round(lim * 0.125))::integer as popular_slots,
      greatest(1, lim - greatest(1, round(lim * 0.625))
        - greatest(0, round(lim * 0.175))
        - greatest(0, round(lim * 0.125)))::integer as discovery_slots
    from effective_limit
  ),

  product_popularity as (
    select
      pr.id as product_id,
      coalesce(oi.order_count, 0)::integer as order_count,
      coalesce(pc.click_count, 0)::integer as click_count
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
      coalesce(pr.tags, '{}'::text[]) as tags,
      pr.main_category,
      pr.audience,
      pr.subcategory,
      cardinality(coalesce(pr.tags, '{}'::text[])) as tag_count,
      (f.follower_id is not null) as is_followed,
      coalesce(ucp.score, 0) as creator_affinity,
      coalesce(sum(utp.score), 0) as tag_pref_sum,
      coalesce(array_agg(distinct utp.tag) filter (where utp.tag is not null), '{}'::text[]) as relevant_tags,
      coalesce(pp.order_count, 0) as order_count,
      coalesce(pp.click_count, 0) as click_count,

      (
        1.0 + least(greatest(coalesce(sum(utp.score), 0), 0), 60) * 0.15
      ) as interest_tag_score,

      (
        1.0 + greatest(0, 5 - extract(epoch from (now() - pr.created_at)) / 86400) / 10.0
      ) as recency_score,

      (
        1.0
        + least(coalesce(pp.order_count, 0), 20) * 0.05
        + least(coalesce(pp.click_count, 0), 50) * 0.02
      ) as popularity_score,

      (
        case
          when cardinality(coalesce(pr.tags, '{}'::text[])) > 0 then
            1.0 + least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.02
          else 1.0
        end
      ) as seller_affinity_score

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
    left join product_popularity pp on pp.product_id = pr.id
    where pr.is_active = true
      and pr.stock > 0
      and public.is_verified_payout_ready_seller(pr.owner_id)
      and cu.user_id is not null
      and not (pr.id = any(coalesce(p_exclude_product_ids, '{}'::uuid[])))
      and (
        p_main_category is null or trim(p_main_category) = ''
        or pr.main_category = trim(p_main_category)
        or (
          pr.main_category is null
          and pr.category is not null
          and (
            (trim(p_main_category) = 'clothing' and lower(trim(pr.category)) = 'kleding')
            or (trim(p_main_category) = 'shoes' and lower(trim(pr.category)) = 'schoenen')
            or (trim(p_main_category) = 'accessories' and lower(trim(pr.category)) = 'accessoires')
            or (trim(p_main_category) = 'beauty' and lower(trim(pr.category)) = 'beauty')
            or (trim(p_main_category) = 'electronics' and lower(trim(pr.category)) = 'elektronica')
            or (trim(p_main_category) = 'home' and lower(trim(pr.category)) = 'wonen')
            or (trim(p_main_category) = 'sports' and lower(trim(pr.category)) = 'sport')
            or (trim(p_main_category) = 'other' and lower(trim(pr.category)) = 'overig')
          )
        )
      )
      and (
        p_audience is null or trim(p_audience) = ''
        or pr.audience = trim(p_audience)
      )
      and (
        p_subcategory is null or trim(p_subcategory) = ''
        or pr.subcategory = trim(p_subcategory)
      )
      and (
        p_search_query is null or trim(p_search_query) = ''
        or pr.name ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
        or coalesce(pr.brand, '') ilike '%' || replace(replace(trim(p_search_query), '%', ''), '_', '') || '%'
      )
    group by
      pr.id, pr.owner_id, pr.name, pr.description, pr.price, pr.category,
      pr.brand, pr.stock, pr.images, pr.sizes, pr.is_active, pr.created_at,
      pr.tags, pr.main_category, pr.audience, pr.subcategory,
      f.follower_id, ucp.score, pp.order_count, pp.click_count
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
        else
          (
            0.55
            + case when s.is_followed then 0.25 else 0 end
            + case when s.creator_affinity >= 15 then 0.15 else 0 end
            + least(s.order_count, 10) * 0.02
            + least(s.click_count, 20) * 0.01
          )
          * s.recency_score
      end as shop_score,
      case
        when s.tag_count > 0 and s.tag_pref_sum >= 5 then 'personal'
        when s.tag_count > 0 and s.tag_pref_sum > 0 then 'similar'
        when s.order_count + s.click_count >= 2 then 'popular'
        else 'discovery'
      end as feed_bucket
    from scored s
  ),

  bucketed as (
    select
      w.*,
      row_number() over (
        partition by w.feed_bucket
        order by w.shop_score desc, w.created_at desc, w.id
      ) as bucket_rn
    from with_shop_score w
  ),

  picked as (
    select b.*
    from bucketed b
    cross join bucket_limits bl
    where
      (b.feed_bucket = 'personal' and b.bucket_rn <= bl.personal_slots)
      or (b.feed_bucket = 'similar' and b.bucket_rn <= bl.similar_slots)
      or (b.feed_bucket = 'popular' and b.bucket_rn <= bl.popular_slots)
      or (b.feed_bucket = 'discovery' and b.bucket_rn <= bl.discovery_slots)
  ),

  picked_count as (
    select count(*)::integer as n from picked
  ),

  fill_limits as (
    select greatest(0, el.lim - pc.n)::integer as fill_slots
    from effective_limit el
    cross join picked_count pc
  ),

  fill_candidates as (
    select
      b.*,
      row_number() over (
        order by b.shop_score desc, b.created_at desc, b.id
      ) as fill_rn
    from bucketed b
    where not exists (select 1 from picked p where p.id = b.id)
  ),

  fill as (
    select fc.*
    from fill_candidates fc
    cross join fill_limits fl
    where fl.fill_slots > 0
      and fc.fill_rn <= fl.fill_slots
  ),

  combined as (
    select
      p.id,
      p.owner_id,
      p.name,
      p.description,
      p.price,
      p.category,
      p.brand,
      p.stock,
      p.images,
      p.sizes,
      p.is_active,
      p.created_at,
      p.tags,
      p.main_category,
      p.audience,
      p.subcategory,
      p.shop_score,
      p.relevant_tags,
      p.feed_bucket
    from picked p
    union all
    select
      f.id,
      f.owner_id,
      f.name,
      f.description,
      f.price,
      f.category,
      f.brand,
      f.stock,
      f.images,
      f.sizes,
      f.is_active,
      f.created_at,
      f.tags,
      f.main_category,
      f.audience,
      f.subcategory,
      f.shop_score,
      f.relevant_tags,
      f.feed_bucket
    from fill f
  )

  select
    c.id,
    c.owner_id,
    c.name,
    c.description,
    c.price,
    c.category,
    c.brand,
    c.stock,
    c.images,
    c.sizes,
    c.is_active,
    c.created_at,
    c.tags,
    c.main_category,
    c.audience,
    c.subcategory,
    c.shop_score::numeric,
    c.relevant_tags,
    c.feed_bucket
  from combined c
  order by
    case c.feed_bucket
      when 'personal' then 1
      when 'similar' then 2
      when 'popular' then 3
      else 4
    end,
    c.shop_score desc,
    c.created_at desc,
    c.id desc
$function$;

revoke all on function public.get_personalized_shop_products(integer, uuid[], text, text, text, text) from public;
grant execute on function public.get_personalized_shop_products(integer, uuid[], text, text, text, text) to authenticated;

comment on function public.get_personalized_shop_products(integer, uuid[], text, text, text, text) is
  'Personalized shop: tag/creator/popularity scoring with ~62/17/12/9 bucket mix per batch; purchasable products only.';

notify pgrst, 'reload schema';
