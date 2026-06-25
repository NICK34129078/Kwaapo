-- =============================================================================
-- 0033_shop_variants_stock_checkout.sql
-- Bundled shop + variant stock + checkout SQL (run once).
-- =============================================================================

-- >>> BEGIN shop_categories_and_personalization_RUN_IN_DASHBOARD.sql <<<
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
-- >>> END shop_categories_and_personalization_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN shop_category_backfill_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- shop_category_backfill_RUN_IN_DASHBOARD.sql
--
-- Run AFTER shop_categories_and_personalization_RUN_IN_DASHBOARD.sql
-- Safe to re-run: only fills NULL main_category from legacy category text.
-- =============================================================================

-- Map legacy Dutch category labels → main_category codes
update public.products
set main_category = case lower(trim(category))
  when 'kleding' then 'clothing'
  when 'schoenen' then 'shoes'
  when 'accessoires' then 'accessories'
  when 'beauty' then 'beauty'
  when 'elektronica' then 'electronics'
  when 'wonen' then 'home'
  when 'sport' then 'sports'
  when 'overig' then 'other'
  else main_category
end
where main_category is null
  and category is not null
  and trim(category) <> '';

-- Fallback: anything still without main_category → other
update public.products
set main_category = 'other'
where main_category is null;

-- Subcategory fallback for legacy products
update public.products
set subcategory = 'other'
where subcategory is null
  and main_category is not null;

-- Keep legacy category text in sync where empty but main_category is set
update public.products
set category = case main_category
  when 'clothing' then 'Kleding'
  when 'shoes' then 'Schoenen'
  when 'accessories' then 'Accessoires'
  when 'beauty' then 'Beauty'
  when 'electronics' then 'Elektronica'
  when 'home' then 'Wonen'
  when 'sports' then 'Sport'
  when 'other' then 'Overig'
  else category
end
where (category is null or trim(category) = '')
  and main_category is not null;

-- Diagnostic (optional — review in SQL editor)
-- select id, name, category, main_category, audience, subcategory, is_active, stock
-- from public.products
-- order by created_at desc;
-- >>> END shop_category_backfill_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN order_stock_reservation_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- Kwaapo: voorraad-reservering bij checkout + commit/release bij betaling
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor vóór Worker deploy met reservation-flow.
--
-- Vervangt checkout_stock_decrement_RUN_IN_DASHBOARD.sql:
--   reserve bij checkout start → commit bij paid (geen tweede decrement)
--   release bij checkout.session.expired (niet bij payment_intent.payment_failed)
-- =============================================================================

alter table public.orders
  add column if not exists stock_reserved_at timestamptz null,
  add column if not exists stock_released_at timestamptz null,
  add column if not exists stock_committed_at timestamptz null;

comment on column public.orders.stock_reserved_at is
  'When product stock was atomically reserved for this checkout session.';

comment on column public.orders.stock_released_at is
  'When reserved stock was returned after failed/expired checkout.';

comment on column public.orders.stock_committed_at is
  'When reserved stock became final after successful payment.';

-- ---------------------------------------------------------------------------
-- reserve: atomisch stock - qty, alleen als unpaid en nog niet actief gereserveerd
-- ---------------------------------------------------------------------------
create or replace function public.reserve_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  updated_rows int;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    id,
    payment_status,
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null or ord.payment_status = 'paid' then
    return false;
  end if;

  -- Actieve reservering (retry / dubbel tikken op dezelfde order)
  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    update public.products
    set stock = stock - item.quantity
    where id = item.product_id
      and stock >= item.quantity;

    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      return false;
    end if;
  end loop;

  update public.orders
  set
    stock_reserved_at = now(),
    stock_released_at = null
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- commit: na succesvolle betaling — stock al afgetrokken bij reserve
-- ---------------------------------------------------------------------------
create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null or ord.stock_released_at is not null then
    return false;
  end if;

  update public.orders
  set stock_committed_at = now()
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- release: bij expired/failed checkout — stock teruggeven
-- ---------------------------------------------------------------------------
create or replace function public.release_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return false;
  end if;

  if ord.stock_released_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    update public.products
    set stock = stock + item.quantity
    where id = item.product_id;
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

comment on function public.reserve_product_stock_for_order(uuid) is
  'Atomically reserve stock when Stripe checkout starts. Idempotent for active reservations.';

comment on function public.commit_product_stock_for_order(uuid) is
  'Finalize reserved stock after payment. Does not decrement stock again.';

comment on function public.release_product_stock_for_order(uuid) is
  'Return reserved stock after failed/expired checkout. Idempotent.';

revoke all on function public.reserve_product_stock_for_order(uuid) from public;
revoke all on function public.commit_product_stock_for_order(uuid) from public;
revoke all on function public.release_product_stock_for_order(uuid) from public;

grant execute on function public.reserve_product_stock_for_order(uuid) to service_role;
grant execute on function public.commit_product_stock_for_order(uuid) to service_role;
grant execute on function public.release_product_stock_for_order(uuid) to service_role;

-- Legacy decrement: redirect to commit-only (no double decrement if reserve flow used)
create or replace function public.decrement_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.commit_product_stock_for_order(p_order_id);
end;
$$;

comment on function public.decrement_product_stock_for_order(uuid) is
  'Deprecated: use commit_product_stock_for_order after reserve flow.';

revoke all on function public.decrement_product_stock_for_order(uuid) from public;
grant execute on function public.decrement_product_stock_for_order(uuid) to service_role;
-- >>> END order_stock_reservation_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN product_stock_management_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- Kwaapo: seller voorraad beheer + historie (veilig bovenop checkout-reservering)
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor.
-- Vereist: order_stock_reservation_RUN_IN_DASHBOARD.sql (stock_* kolommen op orders).
--
-- products.stock = beschikbare voorraad (al verminderd door actieve reserveringen).
-- Handmatige wijzigingen alleen via adjust_product_stock RPC (niet direct UPDATE).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Historie
-- ---------------------------------------------------------------------------
create table if not exists public.product_stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  change_amount int not null,
  stock_before int not null check (stock_before >= 0),
  stock_after int not null check (stock_after >= 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists product_stock_adjustments_product_created_idx
  on public.product_stock_adjustments (product_id, created_at desc);

create index if not exists product_stock_adjustments_seller_created_idx
  on public.product_stock_adjustments (seller_id, created_at desc);

comment on table public.product_stock_adjustments is
  'Audit trail for product stock changes (manual seller actions and checkout lifecycle).';

alter table public.product_stock_adjustments enable row level security;

drop policy if exists "Sellers read own product stock history" on public.product_stock_adjustments;
create policy "Sellers read own product stock history"
  on public.product_stock_adjustments
  for select
  to authenticated
  using (
    seller_id = auth.uid()
    and exists (
      select 1
      from public.products p
      where p.id = product_stock_adjustments.product_id
        and p.owner_id = auth.uid()
    )
  );

-- Geen INSERT/UPDATE/DELETE policies voor authenticated — alleen via SECURITY DEFINER functies.

-- ---------------------------------------------------------------------------
-- Interne helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_business_seller(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.seller_type = 'business'
  );
$$;

create or replace function public.active_reserved_quantity_for_product(p_product_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.quantity), 0)::int
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and o.stock_reserved_at is not null
    and o.stock_released_at is null
    and o.stock_committed_at is null
    and o.payment_status = 'unpaid';
$$;

create or replace function public.log_product_stock_adjustment(
  p_product_id uuid,
  p_seller_id uuid,
  p_change_amount int,
  p_stock_before int,
  p_stock_after int,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_stock_adjustments (
    product_id,
    seller_id,
    change_amount,
    stock_before,
    stock_after,
    reason
  )
  values (
    p_product_id,
    p_seller_id,
    p_change_amount,
    p_stock_before,
    p_stock_after,
    left(trim(p_reason), 120)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Blokkeer directe stock-updates door sellers (gebruik adjust_product_stock)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_product_stock_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stock is not distinct from old.stock then
    return new;
  end if;

  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  -- Transaction-local flag (set_config(..., true)) — alleen binnen dezelfde RPC-transactie.
  if current_setting('app.allow_stock_update', true) = 'true' then
    return new;
  end if;

  raise exception 'products: voorraad kan alleen via voorraad beheer worden aangepast';
end;
$$;

drop trigger if exists enforce_product_stock_update_integrity_trigger on public.products;

create trigger enforce_product_stock_update_integrity_trigger
  before update on public.products
  for each row
  execute function public.enforce_product_stock_update_integrity();

-- ---------------------------------------------------------------------------
-- Seller RPC: voorraad toevoegen of totaal aanpassen
-- ---------------------------------------------------------------------------
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_mode text,
  p_value int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_before int;
  v_after int;
  v_change int;
  v_reason text;
  v_reserved int;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen voorraad beheren';
  end if;

  if p_product_id is null then
    raise exception 'Product ontbreekt';
  end if;

  select id, owner_id, stock
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product niet gevonden';
  end if;

  if v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  v_before := greatest(0, coalesce(v_product.stock, 0));
  v_reserved := public.active_reserved_quantity_for_product(p_product_id);

  if lower(trim(p_mode)) = 'add' then
    if p_value is null or p_value <= 0 then
      raise exception 'Voer een positief aantal in om toe te voegen';
    end if;
    v_after := v_before + p_value;
    v_change := p_value;
    v_reason := 'Voorraad toegevoegd';
  elsif lower(trim(p_mode)) = 'set' then
    if p_value is null or p_value < 0 then
      raise exception 'Voorraad kan niet lager zijn dan 0';
    end if;
    v_after := p_value;
    v_change := v_after - v_before;
    v_reason := 'Voorraad gecorrigeerd';
  else
    raise exception 'Ongeldige voorraadactie';
  end if;

  if v_after < 0 then
    raise exception 'Voorraad kan niet lager zijn dan 0';
  end if;

  perform set_config('app.allow_stock_update', 'true', true);

  update public.products
  set stock = v_after
  where id = p_product_id;

  perform public.log_product_stock_adjustment(
    p_product_id,
    v_user_id,
    v_change,
    v_before,
    v_after,
    v_reason
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'change_amount', v_change,
    'reason', v_reason,
    'active_reserved', v_reserved
  );
end;
$$;

comment on function public.adjust_product_stock(uuid, text, int) is
  'Seller-only: add or set available product stock with audit log.';

revoke all on function public.adjust_product_stock(uuid, text, int) from public;
revoke all on function public.adjust_product_stock(uuid, text, int) from anon;
grant execute on function public.adjust_product_stock(uuid, text, int) to authenticated;

revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from public;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from anon;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text) from authenticated;

revoke all on function public.is_business_seller(uuid) from public;
revoke all on function public.is_business_seller(uuid) from anon;
revoke all on function public.is_business_seller(uuid) from authenticated;

revoke all on function public.active_reserved_quantity_for_product(uuid) from public;
revoke all on function public.active_reserved_quantity_for_product(uuid) from anon;
revoke all on function public.active_reserved_quantity_for_product(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Checkout stock functies: allow flag + historie (vervangt eerdere versies)
-- ---------------------------------------------------------------------------
create or replace function public.reserve_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  updated_rows int;
  v_before int;
  v_after int;
  v_owner uuid;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    id,
    seller_id,
    payment_status,
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null or ord.payment_status = 'paid' then
    return false;
  end if;

  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select stock, owner_id into v_before, v_owner
    from public.products
    where id = item.product_id
    for update;

    perform set_config('app.allow_stock_update', 'true', true);

    update public.products
    set stock = stock - item.quantity
    where id = item.product_id
      and stock >= item.quantity;

    get diagnostics updated_rows = row_count;
    if updated_rows = 0 then
      return false;
    end if;

    select stock into v_after from public.products where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      -item.quantity,
      v_before,
      v_after,
      'Checkout gereserveerd'
    );
  end loop;

  update public.orders
  set
    stock_reserved_at = now(),
    stock_released_at = null
  where id = p_order_id;

  return true;
end;
$$;

create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_owner uuid;
  v_stock int;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null or ord.stock_released_at is not null then
    return false;
  end if;

  update public.orders
  set stock_committed_at = now()
  where id = p_order_id;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select owner_id, stock into v_owner, v_stock
    from public.products
    where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      -item.quantity,
      v_stock,
      v_stock,
      'Verkocht'
    );
  end loop;

  return true;
end;
$$;

create or replace function public.release_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_before int;
  v_after int;
  v_owner uuid;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return false;
  end if;

  if ord.stock_released_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null then
    return true;
  end if;

  for item in
    select oi.product_id, oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select stock, owner_id into v_before, v_owner
    from public.products
    where id = item.product_id
    for update;

    perform set_config('app.allow_stock_update', 'true', true);

    update public.products
    set stock = stock + item.quantity
    where id = item.product_id;

    select stock into v_after from public.products where id = item.product_id;

    perform public.log_product_stock_adjustment(
      item.product_id,
      v_owner,
      item.quantity,
      v_before,
      v_after,
      'Checkout verlopen'
    );
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

revoke all on function public.reserve_product_stock_for_order(uuid) from public;
revoke all on function public.reserve_product_stock_for_order(uuid) from anon;
revoke all on function public.reserve_product_stock_for_order(uuid) from authenticated;
revoke all on function public.commit_product_stock_for_order(uuid) from public;
revoke all on function public.commit_product_stock_for_order(uuid) from anon;
revoke all on function public.commit_product_stock_for_order(uuid) from authenticated;
revoke all on function public.release_product_stock_for_order(uuid) from public;
revoke all on function public.release_product_stock_for_order(uuid) from anon;
revoke all on function public.release_product_stock_for_order(uuid) from authenticated;

grant execute on function public.reserve_product_stock_for_order(uuid) to service_role;
grant execute on function public.commit_product_stock_for_order(uuid) to service_role;
grant execute on function public.release_product_stock_for_order(uuid) to service_role;

create or replace function public.decrement_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.commit_product_stock_for_order(p_order_id);
end;
$$;

revoke all on function public.decrement_product_stock_for_order(uuid) from public;
revoke all on function public.decrement_product_stock_for_order(uuid) from anon;
revoke all on function public.decrement_product_stock_for_order(uuid) from authenticated;
grant execute on function public.decrement_product_stock_for_order(uuid) to service_role;
-- >>> END product_stock_management_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN product_variants_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- product_variants_RUN_IN_DASHBOARD.sql
--
-- Run AFTER product_stock_management_RUN_IN_DASHBOARD.sql
-- Run BEFORE product_variant_stock_reservation_RUN_IN_DASHBOARD.sql
--
-- SAFE: IF NOT EXISTS, CREATE OR REPLACE, idempotent grants.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Product flags
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists uses_variants boolean not null default false,
  add column if not exists variants_ready boolean not null default false;

comment on column public.products.uses_variants is
  'True when seller opted into per-size stock (may still use legacy stock until variants_ready).';
comment on column public.products.variants_ready is
  'True when variant stock is configured; checkout uses product_variants.stock.';

-- ---------------------------------------------------------------------------
-- 2. Variant table
-- ---------------------------------------------------------------------------
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  option_type text not null default 'size',
  option_value text not null,
  sku text null,
  price_override numeric(10, 2) null check (price_override is null or price_override >= 0),
  stock int not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_option_unique unique (product_id, option_type, option_value)
);

create index if not exists product_variants_product_active_idx
  on public.product_variants (product_id, is_active, sort_order);

create index if not exists product_variants_seller_idx
  on public.product_variants (seller_id, product_id);

comment on table public.product_variants is
  'Per-size (or future option) stock. Source of truth when products.variants_ready = true.';

-- Historie per variant (nullable — legacy rows blijven null)
alter table public.product_stock_adjustments
  add column if not exists product_variant_id uuid null references public.product_variants (id) on delete set null;

create index if not exists product_stock_adjustments_variant_created_idx
  on public.product_stock_adjustments (product_variant_id, created_at desc)
  where product_variant_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.product_variants enable row level security;

drop policy if exists "Public read ready variants" on public.product_variants;
create policy "Public read ready variants"
  on public.product_variants
  for select
  to anon, authenticated
  using (
    is_active = true
    and exists (
      select 1
      from public.products p
      where p.id = product_variants.product_id
        and p.is_active = true
        and p.uses_variants = true
        and p.variants_ready = true
    )
  );

drop policy if exists "Owners read own variants" on public.product_variants;
create policy "Owners read own variants"
  on public.product_variants
  for select
  to authenticated
  using (seller_id = auth.uid());

-- No INSERT/UPDATE/DELETE for authenticated — only SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_product_variant_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists product_variants_updated_at on public.product_variants;
create trigger product_variants_updated_at
  before update on public.product_variants
  for each row
  execute function public.touch_product_variant_updated_at();

create or replace function public.sync_product_stock_from_variants(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sum int;
  v_product record;
begin
  if p_product_id is null then
    return;
  end if;

  select id, uses_variants, variants_ready, owner_id
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found or not v_product.uses_variants or not v_product.variants_ready then
    return;
  end if;

  select coalesce(sum(pv.stock), 0)::int
  into v_sum
  from public.product_variants pv
  where pv.product_id = p_product_id
    and pv.is_active = true;

  perform set_config('app.allow_stock_update', 'true', true);

  update public.products
  set stock = greatest(0, v_sum)
  where id = p_product_id;
end;
$$;

create or replace function public.enforce_product_variant_stock_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.stock is not distinct from old.stock then
    return new;
  end if;

  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  if current_setting('app.allow_variant_stock_update', true) = 'true' then
    return new;
  end if;

  raise exception 'product_variants: voorraad kan alleen via voorraad beheer worden aangepast';
end;
$$;

drop trigger if exists enforce_product_variant_stock_integrity_trigger on public.product_variants;
create trigger enforce_product_variant_stock_integrity_trigger
  before update on public.product_variants
  for each row
  execute function public.enforce_product_variant_stock_integrity();

create or replace function public.sync_variants_after_stock_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_product_stock_from_variants(coalesce(new.product_id, old.product_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_product_stock_after_variant_change on public.product_variants;
create trigger sync_product_stock_after_variant_change
  after insert or update of stock, is_active or delete
  on public.product_variants
  for each row
  execute function public.sync_variants_after_stock_change();

-- ---------------------------------------------------------------------------
-- 5. Seller RPC: draft opt-in (migration — stock per maat 0, legacy stock blijft)
-- ---------------------------------------------------------------------------
drop function if exists public.enable_product_variants_draft(uuid, text[]);

create function public.enable_product_variants_draft(
  p_product_id uuid,
  p_option_values text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_val text;
  v_ord int := 0;
  v_created int := 0;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen varianten beheren';
  end if;

  select id, owner_id, uses_variants, variants_ready
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product niet gevonden';
  end if;

  if v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  if v_product.variants_ready then
    raise exception 'Voorraad per maat is al actief';
  end if;

  if p_option_values is null or cardinality(p_option_values) = 0 then
    raise exception 'Kies minimaal één maat';
  end if;

  update public.products
  set uses_variants = true
  where id = p_product_id;

  foreach v_val in array p_option_values
  loop
    v_val := trim(v_val);
    if length(v_val) = 0 then
      continue;
    end if;
    v_ord := v_ord + 1;

    insert into public.product_variants (
      product_id,
      seller_id,
      option_type,
      option_value,
      stock,
      is_active,
      sort_order
    )
    values (
      p_product_id,
      v_user_id,
      'size',
      v_val,
      0,
      true,
      v_ord
    )
    on conflict (product_id, option_type, option_value) do update
      set
        is_active = true,
        sort_order = excluded.sort_order,
        updated_at = now();

    v_created := v_created + 1;
  end loop;

  return jsonb_build_object(
    'product_id', p_product_id,
    'uses_variants', true,
    'variants_ready', false,
    'variants_created', v_created
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Seller RPC: save variant stocks (upsert values + stock)
-- ---------------------------------------------------------------------------
drop function if exists public.save_product_variant_stocks(uuid, jsonb);

create function public.save_product_variant_stocks(
  p_product_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_item jsonb;
  v_val text;
  v_stock int;
  v_ord int := 0;
  v_total int := 0;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen varianten beheren';
  end if;

  select id, owner_id, uses_variants, variants_ready
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product niet gevonden';
  end if;

  if v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  if not v_product.uses_variants then
    raise exception 'Dit product gebruikt nog geen varianten';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Ongeldige variantgegevens';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_val := trim(coalesce(v_item->>'option_value', ''));
    if length(v_val) = 0 then
      continue;
    end if;
    v_ord := v_ord + 1;
    v_stock := greatest(0, coalesce((v_item->>'stock')::int, 0));

    perform set_config('app.allow_variant_stock_update', 'true', true);

    insert into public.product_variants (
      product_id,
      seller_id,
      option_type,
      option_value,
      stock,
      is_active,
      sort_order
    )
    values (
      p_product_id,
      v_user_id,
      coalesce(nullif(trim(v_item->>'option_type'), ''), 'size'),
      v_val,
      v_stock,
      coalesce((v_item->>'is_active')::boolean, true),
      v_ord
    )
    on conflict (product_id, option_type, option_value) do update
      set
        stock = excluded.stock,
        is_active = excluded.is_active,
        sort_order = excluded.sort_order,
        updated_at = now();

    v_total := v_total + v_stock;
  end loop;

  if v_product.variants_ready then
    perform public.sync_product_stock_from_variants(p_product_id);
  end if;

  return jsonb_build_object(
    'product_id', p_product_id,
    'variants_ready', v_product.variants_ready,
    'total_stock', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Seller RPC: activate variant mode (replaces legacy stock with sum)
-- ---------------------------------------------------------------------------
drop function if exists public.activate_product_variants(uuid);

create function public.activate_product_variants(p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_count int;
  v_sum int;
  v_sizes text[];
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select id, owner_id, uses_variants, variants_ready, stock
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found or v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  if not v_product.uses_variants then
    raise exception 'Schakel eerst voorraad per maat in';
  end if;

  if v_product.variants_ready then
    return jsonb_build_object('product_id', p_product_id, 'variants_ready', true);
  end if;

  select count(*)::int, coalesce(sum(stock), 0)::int
  into v_count, v_sum
  from public.product_variants
  where product_id = p_product_id
    and is_active = true;

  if v_count = 0 then
    raise exception 'Voeg minimaal één maat toe';
  end if;

  update public.products
  set variants_ready = true
  where id = p_product_id;

  perform public.sync_product_stock_from_variants(p_product_id);

  select coalesce(array_agg(option_value order by sort_order, option_value), '{}'::text[])
  into v_sizes
  from public.product_variants
  where product_id = p_product_id
    and is_active = true;

  update public.products
  set sizes = to_jsonb(v_sizes)
  where id = p_product_id;

  return jsonb_build_object(
    'product_id', p_product_id,
    'variants_ready', true,
    'total_stock', v_sum
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Seller RPC: adjust single variant stock
-- ---------------------------------------------------------------------------
drop function if exists public.adjust_product_variant_stock(uuid, text, int);

create function public.adjust_product_variant_stock(
  p_variant_id uuid,
  p_mode text,
  p_value int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_variant record;
  v_before int;
  v_after int;
  v_change int;
  v_reason text;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  select pv.*, p.variants_ready, p.uses_variants
  into v_variant
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id
  for update of pv;

  if not found then
    raise exception 'Maat niet gevonden';
  end if;

  if v_variant.seller_id is distinct from v_user_id then
    raise exception 'Geen toegang tot deze maat';
  end if;

  if not v_variant.uses_variants or not v_variant.variants_ready then
    raise exception 'Activeer eerst voorraad per maat';
  end if;

  v_before := greatest(0, v_variant.stock);

  if lower(trim(p_mode)) = 'add' then
    if p_value is null or p_value <= 0 then
      raise exception 'Voer een positief aantal in';
    end if;
    v_after := v_before + p_value;
    v_change := p_value;
    v_reason := 'Maat ' || v_variant.option_value || ': voorraad toegevoegd';
  elsif lower(trim(p_mode)) = 'set' then
    if p_value is null or p_value < 0 then
      raise exception 'Voorraad kan niet lager zijn dan 0';
    end if;
    v_after := p_value;
    v_change := v_after - v_before;
    v_reason := 'Maat ' || v_variant.option_value || ': voorraad aangepast';
  else
    raise exception 'Ongeldige voorraadactie';
  end if;

  perform set_config('app.allow_variant_stock_update', 'true', true);

  update public.product_variants
  set stock = v_after
  where id = p_variant_id;

  perform public.log_product_stock_adjustment(
    v_variant.product_id,
    v_user_id,
    v_change,
    v_before,
    v_after,
    v_reason,
    p_variant_id
  );

  return jsonb_build_object(
    'variant_id', p_variant_id,
    'option_value', v_variant.option_value,
    'stock_before', v_before,
    'stock_after', v_after,
    'change_amount', v_change
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. log_product_stock_adjustment (7-arg, with variant_id)
-- ---------------------------------------------------------------------------
drop function if exists public.log_product_stock_adjustment(uuid, uuid, int, int, int, text);
drop function if exists public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid);

create or replace function public.log_product_stock_adjustment(
  p_product_id uuid,
  p_seller_id uuid,
  p_change_amount int,
  p_stock_before int,
  p_stock_after int,
  p_reason text,
  p_variant_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.product_stock_adjustments (
    product_id,
    seller_id,
    change_amount,
    stock_before,
    stock_after,
    reason,
    product_variant_id
  )
  values (
    p_product_id,
    p_seller_id,
    p_change_amount,
    p_stock_before,
    p_stock_after,
    left(trim(p_reason), 160),
    p_variant_id
  );
end;
$$;

revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from public;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from anon;
revoke all on function public.log_product_stock_adjustment(uuid, uuid, int, int, int, text, uuid) from authenticated;

-- Grants (variant RPCs)
revoke all on function public.sync_product_stock_from_variants(uuid) from public;
revoke all on function public.enable_product_variants_draft(uuid, text[]) from public;
revoke all on function public.save_product_variant_stocks(uuid, jsonb) from public;
revoke all on function public.activate_product_variants(uuid) from public;
revoke all on function public.adjust_product_variant_stock(uuid, text, int) from public;

grant execute on function public.enable_product_variants_draft(uuid, text[]) to authenticated;
grant execute on function public.save_product_variant_stocks(uuid, jsonb) to authenticated;
grant execute on function public.activate_product_variants(uuid) to authenticated;
grant execute on function public.adjust_product_variant_stock(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
-- >>> END product_variants_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN product_variant_stock_reservation_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- product_variant_stock_reservation_RUN_IN_DASHBOARD.sql
--
-- Run AFTER product_variants_RUN_IN_DASHBOARD.sql
-- Vervangt reserve/commit/release + adjust_product_stock voor variant-ondersteuning.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. order_items uitbreiding
-- ---------------------------------------------------------------------------
alter table public.order_items
  add column if not exists product_variant_id uuid null references public.product_variants (id) on delete restrict,
  add column if not exists selected_variant_type text null,
  add column if not exists selected_variant_value text null;

create index if not exists order_items_variant_idx
  on public.order_items (product_variant_id)
  where product_variant_id is not null;

comment on column public.order_items.product_variant_id is
  'Gekozen variant bij checkout (verplicht wanneer products.variants_ready = true).';

-- ---------------------------------------------------------------------------
-- 2. adjust_product_stock — blokkeer bij actieve variantproducten
-- ---------------------------------------------------------------------------
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_mode text,
  p_value int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_product record;
  v_before int;
  v_after int;
  v_change int;
  v_reason text;
  v_reserved int;
begin
  if v_user_id is null then
    raise exception 'Niet ingelogd';
  end if;

  if not public.is_business_seller(v_user_id) then
    raise exception 'Alleen zakelijke verkopers kunnen voorraad beheren';
  end if;

  select id, owner_id, stock, uses_variants, variants_ready
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product niet gevonden';
  end if;

  if v_product.owner_id is distinct from v_user_id then
    raise exception 'Geen toegang tot dit product';
  end if;

  if v_product.uses_variants and v_product.variants_ready then
    raise exception 'Gebruik voorraad per maat voor dit product';
  end if;

  v_before := greatest(0, coalesce(v_product.stock, 0));
  v_reserved := public.active_reserved_quantity_for_product(p_product_id);

  if lower(trim(p_mode)) = 'add' then
    if p_value is null or p_value <= 0 then
      raise exception 'Voer een positief aantal in om toe te voegen';
    end if;
    v_after := v_before + p_value;
    v_change := p_value;
    v_reason := 'Voorraad toegevoegd';
  elsif lower(trim(p_mode)) = 'set' then
    if p_value is null or p_value < 0 then
      raise exception 'Voorraad kan niet lager zijn dan 0';
    end if;
    v_after := p_value;
    v_change := v_after - v_before;
    v_reason := 'Voorraad gecorrigeerd';
  else
    raise exception 'Ongeldige voorraadactie';
  end if;

  perform set_config('app.allow_stock_update', 'true', true);

  update public.products
  set stock = v_after
  where id = p_product_id;

  perform public.log_product_stock_adjustment(
    p_product_id,
    v_user_id,
    v_change,
    v_before,
    v_after,
    v_reason,
    null
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'stock_before', v_before,
    'stock_after', v_after,
    'change_amount', v_change,
    'reason', v_reason,
    'active_reserved', v_reserved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. reserve_product_stock_for_order
-- ---------------------------------------------------------------------------
create or replace function public.reserve_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_product record;
  v_variant record;
  updated_rows int;
  v_before int;
  v_after int;
  v_owner uuid;
  v_reason text;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    id,
    seller_id,
    payment_status,
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null or ord.payment_status = 'paid' then
    return false;
  end if;

  if ord.stock_reserved_at is not null and ord.stock_released_at is null then
    return true;
  end if;

  for item in
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity,
      oi.selected_variant_value
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select
      p.id,
      p.owner_id,
      p.uses_variants,
      p.variants_ready,
      p.stock
    into v_product
    from public.products p
    where p.id = item.product_id
    for update;

    if not found then
      return false;
    end if;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready then
      if item.product_variant_id is null then
        return false;
      end if;

      select pv.id, pv.product_id, pv.option_value, pv.stock, pv.seller_id
      into v_variant
      from public.product_variants pv
      where pv.id = item.product_variant_id
        and pv.product_id = item.product_id
        and pv.is_active = true
      for update;

      if not found then
        return false;
      end if;

      v_before := greatest(0, v_variant.stock);

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock - item.quantity
      where id = v_variant.id
        and stock >= item.quantity;

      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        return false;
      end if;

      select stock into v_after from public.product_variants where id = v_variant.id;

      v_reason := 'Maat ' || v_variant.option_value || ': checkout gereserveerd';

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_before,
        v_after,
        v_reason,
        v_variant.id
      );
    else
      v_before := greatest(0, v_product.stock);

      perform set_config('app.allow_stock_update', 'true', true);

      update public.products
      set stock = stock - item.quantity
      where id = item.product_id
        and stock >= item.quantity;

      get diagnostics updated_rows = row_count;
      if updated_rows = 0 then
        return false;
      end if;

      select stock into v_after from public.products where id = item.product_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_before,
        v_after,
        'Checkout gereserveerd',
        null
      );
    end if;
  end loop;

  update public.orders
  set
    stock_reserved_at = now(),
    stock_released_at = null
  where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. commit_product_stock_for_order
-- ---------------------------------------------------------------------------
create or replace function public.commit_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_product record;
  v_variant record;
  v_owner uuid;
  v_stock int;
  v_option_value text;
  v_reason text;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null or ord.stock_released_at is not null then
    return false;
  end if;

  update public.orders
  set stock_committed_at = now()
  where id = p_order_id;

  for item in
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity,
      oi.selected_variant_value
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select uses_variants, variants_ready, owner_id
    into v_product
    from public.products
    where id = item.product_id;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready and item.product_variant_id is not null then
      select stock, option_value
      into v_stock, v_option_value
      from public.product_variants
      where id = item.product_variant_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_stock,
        v_stock,
        'Maat ' || v_option_value || ': verkocht',
        item.product_variant_id
      );
    else
      select stock into v_stock
      from public.products
      where id = item.product_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        -item.quantity,
        v_stock,
        v_stock,
        'Verkocht',
        null
      );
    end if;
  end loop;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. release_product_stock_for_order
-- ---------------------------------------------------------------------------
create or replace function public.release_product_stock_for_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ord record;
  item record;
  v_product record;
  v_variant record;
  updated_rows int;
  v_before int;
  v_after int;
  v_owner uuid;
  v_reason text;
begin
  if p_order_id is null then
    return false;
  end if;

  select
    stock_reserved_at,
    stock_released_at,
    stock_committed_at
  into ord
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return false;
  end if;

  if ord.stock_committed_at is not null then
    return false;
  end if;

  if ord.stock_released_at is not null then
    return true;
  end if;

  if ord.stock_reserved_at is null then
    return true;
  end if;

  for item in
    select
      oi.product_id,
      oi.product_variant_id,
      oi.quantity
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select uses_variants, variants_ready, owner_id
    into v_product
    from public.products
    where id = item.product_id
    for update;

    v_owner := v_product.owner_id;

    if v_product.uses_variants and v_product.variants_ready and item.product_variant_id is not null then
      select id, stock, option_value
      into v_variant
      from public.product_variants
      where id = item.product_variant_id
      for update;

      v_before := greatest(0, v_variant.stock);

      perform set_config('app.allow_variant_stock_update', 'true', true);

      update public.product_variants
      set stock = stock + item.quantity
      where id = v_variant.id;

      select stock into v_after from public.product_variants where id = v_variant.id;

      v_reason := 'Maat ' || v_variant.option_value || ': checkout verlopen';

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        item.quantity,
        v_before,
        v_after,
        v_reason,
        v_variant.id
      );
    else
      select stock into v_before
      from public.products
      where id = item.product_id
      for update;

      perform set_config('app.allow_stock_update', 'true', true);

      update public.products
      set stock = stock + item.quantity
      where id = item.product_id;

      select stock into v_after from public.products where id = item.product_id;

      perform public.log_product_stock_adjustment(
        item.product_id,
        v_owner,
        item.quantity,
        v_before,
        v_after,
        'Checkout verlopen',
        null
      );
    end if;
  end loop;

  update public.orders
  set stock_released_at = now()
  where id = p_order_id;

  return true;
end;
$$;

comment on function public.reserve_product_stock_for_order(uuid) is
  'Reserve stock per variant when variants_ready, else products.stock.';

notify pgrst, 'reload schema';
-- >>> END product_variant_stock_reservation_RUN_IN_DASHBOARD.sql <<<

-- >>> BEGIN orders_payment_integrity_guard_RUN_IN_DASHBOARD.sql <<<
-- =============================================================================
-- Kwaapo: order payment integrity — blokkeer client-wijzigingen aan betaalvelden
-- =============================================================================
-- Run in Supabase Dashboard SQL Editor.
--
-- Waarom trigger i.p.v. kolom-RLS:
-- Postgres RLS werkt per rie, niet per kolom. Een BEFORE UPDATE trigger is de
-- kleinste veilige oplossing: sellers houden directe fulfillment-updates via
-- Supabase client; payment/financial velden alleen via service_role (Worker).
-- =============================================================================

create or replace function public.enforce_order_update_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt()->>'role', '');
begin
  -- Worker / PostgREST service role
  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'orders: authentication required';
  end if;

  -- Buyers: no direct updates (RLS has no buyer UPDATE policy; defense in depth)
  if auth.uid() = old.buyer_id and auth.uid() is distinct from old.seller_id then
    raise exception 'orders: buyers cannot update orders';
  end if;

  if auth.uid() = old.seller_id then
    -- Payment / Stripe / financial / identity
    if new.payment_status is distinct from old.payment_status then
      raise exception 'orders: sellers cannot change payment_status';
    end if;
    if new.paid_at is distinct from old.paid_at then
      raise exception 'orders: sellers cannot change paid_at';
    end if;
    if new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id then
      raise exception 'orders: sellers cannot change stripe_checkout_session_id';
    end if;
    if new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id then
      raise exception 'orders: sellers cannot change stripe_payment_intent_id';
    end if;
    if new.subtotal_amount is distinct from old.subtotal_amount then
      raise exception 'orders: sellers cannot change subtotal_amount';
    end if;
    if new.platform_fee_amount is distinct from old.platform_fee_amount then
      raise exception 'orders: sellers cannot change platform_fee_amount';
    end if;
    if new.seller_amount is distinct from old.seller_amount then
      raise exception 'orders: sellers cannot change seller_amount';
    end if;
    if new.buyer_id is distinct from old.buyer_id then
      raise exception 'orders: sellers cannot change buyer_id';
    end if;
    if new.seller_id is distinct from old.seller_id then
      raise exception 'orders: sellers cannot change seller_id';
    end if;
    if new.id is distinct from old.id then
      raise exception 'orders: sellers cannot change order id';
    end if;

    -- Stock reservation lifecycle (Worker only)
    if new.stock_reserved_at is distinct from old.stock_reserved_at then
      raise exception 'orders: sellers cannot change stock_reserved_at';
    end if;
    if new.stock_released_at is distinct from old.stock_released_at then
      raise exception 'orders: sellers cannot change stock_released_at';
    end if;
    if new.stock_committed_at is distinct from old.stock_committed_at then
      raise exception 'orders: sellers cannot change stock_committed_at';
    end if;

    -- Buyer checkout / shipping capture (set at order creation by buyer)
    if new.buyer_email is distinct from old.buyer_email then
      raise exception 'orders: sellers cannot change buyer_email';
    end if;
    if new.buyer_full_name is distinct from old.buyer_full_name then
      raise exception 'orders: sellers cannot change buyer_full_name';
    end if;
    if new.shipping_country is distinct from old.shipping_country then
      raise exception 'orders: sellers cannot change shipping_country';
    end if;
    if new.shipping_city is distinct from old.shipping_city then
      raise exception 'orders: sellers cannot change shipping_city';
    end if;
    if new.shipping_postal_code is distinct from old.shipping_postal_code then
      raise exception 'orders: sellers cannot change shipping_postal_code';
    end if;
    if new.shipping_street is distinct from old.shipping_street then
      raise exception 'orders: sellers cannot change shipping_street';
    end if;
    if new.shipping_house_number is distinct from old.shipping_house_number then
      raise exception 'orders: sellers cannot change shipping_house_number';
    end if;
    if new.shipping_phone is distinct from old.shipping_phone then
      raise exception 'orders: sellers cannot change shipping_phone';
    end if;

    -- Status: allow fulfillment transitions only (not payment states)
    if new.status is distinct from old.status
       and new.status in ('paid', 'pending_payment', 'refunded') then
      raise exception 'orders: sellers cannot set payment-related status';
    end if;

    -- Allowed seller fields: status (fulfillment), shipping_status, tracking_code,
    -- shipped_at, seller_note — no further checks needed.
    return new;
  end if;

  raise exception 'orders: update not permitted';
end;
$$;

drop trigger if exists enforce_order_update_integrity_trigger on public.orders;

create trigger enforce_order_update_integrity_trigger
  before update on public.orders
  for each row
  execute function public.enforce_order_update_integrity();

comment on function public.enforce_order_update_integrity() is
  'Blocks authenticated sellers/buyers from mutating payment and financial order fields.';

-- Re-affirm RLS policies (no buyer UPDATE; seller SELECT + limited UPDATE)
alter table public.orders enable row level security;

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
drop policy if exists "Sellers update own order fulfillment" on public.orders;
create policy "Sellers update own order fulfillment"
  on public.orders
  for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);
-- >>> END orders_payment_integrity_guard_RUN_IN_DASHBOARD.sql <<<
