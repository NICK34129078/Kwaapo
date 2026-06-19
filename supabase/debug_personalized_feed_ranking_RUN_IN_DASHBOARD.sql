-- =============================================================================
-- debug_personalized_feed_ranking_RUN_IN_DASHBOARD.sql
-- RUN IN SUPABASE SQL EDITOR
--
-- Toont welke posts bovenaan zouden komen voor de ingelogde gebruiker,
-- met dezelfde scorelogica als get_personalized_feed (incl. creator affinity).
-- Vervangt de functie NIET.
--
-- Gebruik: run terwijl je ingelogd bent als testgebruiker in SQL Editor
-- (auth.uid() moet gezet zijn), of pas cu.user_id handmatig aan.
-- =============================================================================

with current_user_id as (
  select auth.uid() as user_id
),
video_completion_stats as (
  select
    vv.post_id,
    count(*)::integer as view_count,
    avg(vv.watched_percent) as avg_watched_percent,
    count(*) filter (where coalesce(vv.completed, false))::numeric
      / nullif(count(*), 0)::numeric as completion_rate
  from public.video_views vv
  group by vv.post_id
),
base_scored as (
  select
    p.id,
    p.user_id as creator_id,
    p.type,
    p.created_at,
    coalesce(p.tags, '{}'::text[]) as tags,
    cardinality(coalesce(p.tags, '{}'::text[])) as tag_count,
    coalesce(p.likes_count, 0) as likes_count,
    coalesce(p.comments_count, 0) as comments_count,
    coalesce(ucp.score, 0) as creator_affinity_score,
    (f.follower_id is not null) as is_followed,

    coalesce(sum(utp.score), 0) as tag_pref_sum,
    least(coalesce(p.likes_count, 0), 50) * 0.15 as likes_boost,
    least(coalesce(p.comments_count, 0), 30) * 0.2 as comments_boost,
    greatest(0, 5 - extract(epoch from (now() - p.created_at)) / 86400) as recency_boost,
    random() * 1.5 as jitter,
    case
      when coalesce(vc.view_count, 0) >= 3 then
        coalesce(vc.completion_rate, 0) * 4.0
        + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
      else 0
    end as completion_boost,
    least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.12 as creator_affinity_boost,
    case
      when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then
        case
          when f.follower_id is not null
           and p.created_at > now() - interval '24 hours' then 6.0
          when f.follower_id is not null
           and p.created_at > now() - interval '72 hours' then 3.0
          when coalesce(ucp.score, 0) >= 15
           and p.created_at > now() - interval '48 hours' then 4.0
          else 0
        end
      else 0
    end as follow_recency_boost,

    (
      coalesce(sum(utp.score), 0)
      + least(coalesce(p.likes_count, 0), 50) * 0.15
      + least(coalesce(p.comments_count, 0), 30) * 0.2
      + greatest(0, 5 - extract(epoch from (now() - p.created_at)) / 86400)
      + random() * 1.5
      + case
          when coalesce(vc.view_count, 0) >= 3 then
            coalesce(vc.completion_rate, 0) * 4.0
            + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
          else 0
        end
      + least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.12
      + case
          when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then
            case
              when f.follower_id is not null
               and p.created_at > now() - interval '24 hours' then 6.0
              when f.follower_id is not null
               and p.created_at > now() - interval '72 hours' then 3.0
              when coalesce(ucp.score, 0) >= 15
               and p.created_at > now() - interval '48 hours' then 4.0
              else 0
            end
          else 0
        end
    ) as base_score

  from public.posts p
  cross join current_user_id cu
  left join video_completion_stats vc on vc.post_id = p.id
  left join public.user_tag_preferences utp
    on utp.user_id = cu.user_id
   and utp.tag = any(coalesce(p.tags, '{}'))
  left join public.user_post_view_state upvs
    on upvs.user_id = cu.user_id
   and upvs.post_id = p.id
  left join public.user_creator_preferences ucp
    on ucp.user_id = cu.user_id
   and ucp.creator_id = p.user_id
  left join public.follows f
    on f.follower_id = cu.user_id
   and f.following_id::text = p.user_id
  where
    coalesce(p.is_deleted, false) = false
    and coalesce(p.type, 'video') = 'video'
    and (
      upvs.post_id is null
      or upvs.last_viewed_at < now() - interval '7 days'
    )
    and (
      cardinality(coalesce(p.tags, '{}'::text[])) > 0
      or random() < 0.05
    )
  group by
    p.id, p.user_id, p.type, p.created_at, p.tags,
    p.likes_count, p.comments_count,
    vc.view_count, vc.avg_watched_percent, vc.completion_rate,
    ucp.score, f.follower_id
),
ranked as (
  select
    *,
    case
      when tag_count = 0 then (base_score * 0.1 - 10)::numeric
      else (base_score + 1.0)::numeric
    end as ranking_score,
    (tag_count = 0) as is_no_tag,
    case
      when tag_count = 0 then 'no-tag gedempt (base*0.1-10)'
      when is_followed and created_at > now() - interval '24 hours'
        then 'tagged + follow <24h'
      when is_followed and created_at > now() - interval '72 hours'
        then 'tagged + follow <72h'
      when creator_affinity_score >= 15 and created_at > now() - interval '48 hours'
        then 'tagged + hoge affinity <48h'
      when tag_pref_sum > 0 then 'tagged + tag preference match'
      when recency_boost > 3 then 'tagged + recency'
      else 'tagged baseline'
    end as rank_reason
  from base_scored
)
select
  id,
  created_at,
  type,
  tags,
  tag_count,
  is_no_tag,
  creator_id,
  likes_count,
  comments_count,
  round(tag_pref_sum::numeric, 2) as tag_pref_sum,
  round(creator_affinity_score::numeric, 2) as creator_affinity_score,
  is_followed,
  round(base_score::numeric, 2) as base_score,
  round(ranking_score::numeric, 2) as ranking_score,
  rank_reason
from ranked
order by
  case
    when cardinality(coalesce(tags, '{}'::text[])) > 0 then 0
    else 1
  end asc,
  ranking_score desc,
  created_at desc
limit 50;
