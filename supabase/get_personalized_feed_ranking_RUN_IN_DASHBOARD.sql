-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR (niet via supabase db push)
--
-- Doel: live testen van de ranking-versie van get_personalized_feed zonder
-- de bestaande migration (0006_get_personalized_feed_exclude_batch.sql) te wijzigen.
--
-- 1) Exporteer eerst je huidige functie (backup):
--      select pg_get_functiondef('public.get_personalized_feed(integer, uuid[])'::regprocedure);
--
-- 2) Controleer eerst of video_views de juiste kolommen heeft:
--      select column_name, data_type from information_schema.columns
--      where table_schema = 'public' and table_name = 'video_views'
--      and column_name in ('watched_percent', 'completed');
--    Verwacht: 2 rijen (numeric + boolean).
--
-- 3) Voer dit hele script uit in de SQL Editor.
--
-- 4) Test in de app (feed laden, infinite scroll, exclude batch).
--
-- 5) Rollback: plak je backup uit stap 1 terug en voer opnieuw uit.
--
-- Ranking-strategie voor posts zonder hashtags:
--   - 95% wordt hard uitgesloten via WHERE (explore filter).
--   - De 5% die doorkomt krijgt: base_score * 0.1 - 10  (score ~= -8 tot -7).
--   - Recency, jitter en completion boost zijn al in base_score ingebakken,
--     maar de demping maakt ze irrelevant: zelfs een splinternieuwe no-tag
--     post kan een gerankte tagged post niet passeren.
--   - Posts met hashtags: base_score + 1.0.
--   - Completion boost (>=3 views) geldt voor beide groepen, maar wordt voor
--     no-tag posts meegenomen in base_score vóór de demping (dus 10× gereduceerd).
-- =============================================================================

drop function if exists public.get_personalized_feed(integer, uuid[]);

create function public.get_personalized_feed(
  p_limit integer default 10,
  p_exclude_post_ids uuid[] default '{}'::uuid[]
)
returns table(
  id uuid,
  user_id text,
  type text,
  video_url text,
  r2_key text,
  thumbnail_url text,
  caption text,
  likes_count integer,
  comments_count integer,
  created_at timestamp with time zone,
  tags text[],
  ranking_score numeric
)
language sql
stable
security definer
set search_path = public
as $function$
  with current_user_id as (
    select auth.uid() as user_id
  ),

  -- Completion stats per post (eenmalig berekend, buiten de hoofdquery)
  video_completion_stats as (
    select
      vv.post_id,
      count(*)::integer                                                    as view_count,
      avg(vv.watched_percent)                                              as avg_watched_percent,
      count(*) filter (where coalesce(vv.completed, false))::numeric
        / nullif(count(*), 0)::numeric                                     as completion_rate
    from public.video_views vv
    group by vv.post_id
  ),

  -- Fase 1: basisscores berekenen + explore filter toepassen
  base_scored as (
    select
      p.id,
      p.user_id,
      p.type,
      p.video_url,
      p.r2_key,
      p.thumbnail_url,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.created_at,
      coalesce(p.tags, '{}')                             as tags,
      cardinality(coalesce(p.tags, '{}'::text[]))        as tag_count,

      (
        -- Tag-preference score (gepersonaliseerd)
        coalesce(sum(utp.score), 0)
        -- Engagement
        + least(coalesce(p.likes_count, 0), 50) * 0.15
        + least(coalesce(p.comments_count, 0), 30) * 0.2
        -- Recency (max +5, daalt naar 0 na 5 dagen)
        + greatest(
            0,
            5 - extract(epoch from (now() - p.created_at)) / 86400
          )
        -- Random jitter (lichte variatie per request)
        + random() * 1.5
        -- Completion boost (min. 3 views vereist)
        + case
            when coalesce(vc.view_count, 0) >= 3 then
              coalesce(vc.completion_rate, 0) * 4.0
              + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
            else 0
          end
      )                                                  as base_score

    from public.posts p
    cross join current_user_id cu
    left join video_completion_stats vc on vc.post_id = p.id
    left join public.user_tag_preferences utp
      on utp.user_id = cu.user_id
     and utp.tag = any(coalesce(p.tags, '{}'))
    left join public.user_post_view_state upvs
      on upvs.user_id = cu.user_id
     and upvs.post_id = p.id
    where
      coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') = 'video'
      and not (p.id = any(coalesce(p_exclude_post_ids, '{}'::uuid[])))
      -- 7-dagenregel: al geziene posts blijven weg totdat ze "oud genoeg" zijn
      and (
        upvs.post_id is null
        or upvs.last_viewed_at < now() - interval '7 days'
      )
      -- Explore filter: 95% van no-tag posts wordt hier al uitgesloten.
      -- Alleen 5% haalt de volgende fase (sterk gedempte score).
      and (
        cardinality(coalesce(p.tags, '{}'::text[])) > 0
        or random() < 0.05
      )
    group by
      p.id,
      p.user_id,
      p.type,
      p.video_url,
      p.r2_key,
      p.thumbnail_url,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.created_at,
      p.tags,
      vc.view_count,
      vc.avg_watched_percent,
      vc.completion_rate
  ),

  -- Fase 2: harde demping voor no-tag posts, kleine bonus voor tagged posts
  ranked_posts as (
    select
      id,
      user_id,
      type,
      video_url,
      r2_key,
      thumbnail_url,
      caption,
      likes_count,
      comments_count,
      created_at,
      tags,
      -- Geen hashtags: base_score * 0.1 - 10
      --   Voorbeeld: base=8 → 8*0.1-10 = -9.2  (nooit bovenaan)
      -- Wel hashtags: base_score + 1.0
      --   Voorbeeld: base=8 → 9.0              (normaal meedoen)
      case
        when tag_count = 0 then (base_score * 0.1 - 10)::numeric
        else (base_score + 1.0)::numeric
      end as ranking_score
    from base_scored
  )

  select *
  from ranked_posts
  order by
    case
      when cardinality(coalesce(tags, '{}'::text[])) > 0 then 0
      else 1
    end asc,
    ranking_score desc,
    created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$function$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
