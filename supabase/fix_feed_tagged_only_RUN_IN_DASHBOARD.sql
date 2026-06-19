-- =============================================================================
-- fix_feed_tagged_only_RUN_IN_DASHBOARD.sql
--
-- Run in Supabase SQL Editor (dashboard only — geen migration).
--
-- Controlled explore For You / get_personalized_feed:
--   • tagged_ranked = normale hoofdfeed (volledig algoritme)
--   • untagged_fallback = zeldzame controlled filler (niet chronologisch)
--   • No-tag nooit boven tagged in RPC-output (UNION ALL)
--   • Client interleaved verder via buildControlledForYouMix
-- =============================================================================

drop function if exists public.get_personalized_feed(integer, uuid[]);

create function public.get_personalized_feed(
  p_limit             integer   default 10,
  p_exclude_post_ids  uuid[]    default '{}'::uuid[]
)
returns table(
  id              uuid,
  user_id         text,
  type            text,
  video_url       text,
  r2_key          text,
  thumbnail_url   text,
  caption         text,
  likes_count     integer,
  comments_count  integer,
  created_at      timestamp with time zone,
  tags            text[],
  ranking_score   numeric
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
    select least(greatest(coalesce(p_limit, 10), 1), 25) as lim
  ),

  untagged_slot_limit as (
    -- ~1 no-tag per 9 tagged posts, max 3 per batch
    select greatest(
      1,
      least(3, ((select lim from effective_limit) + 8) / 9)
    )::integer as slots
  ),

  video_completion_stats as (
    select
      vv.post_id,
      count(*)::integer                                                      as view_count,
      avg(vv.watched_percent)                                                as avg_watched_percent,
      count(*) filter (where coalesce(vv.completed, false))::numeric
        / nullif(count(*), 0)::numeric                                       as completion_rate
    from public.video_views vv
    group by vv.post_id
  ),

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
      coalesce(p.tags, '{}'::text[])                      as tags,
      cardinality(coalesce(p.tags, '{}'::text[]))         as tag_count,
      (f.follower_id is not null)                          as is_followed,
      coalesce(ucp.score, 0)                               as creator_affinity,

      (
        case
          when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then
            coalesce(sum(utp.score), 0)
            + least(coalesce(p.likes_count, 0), 50) * 0.15
            + least(coalesce(p.comments_count, 0), 30) * 0.2
            + greatest(
                0,
                5 - extract(epoch from (now() - p.created_at)) / 86400
              )
            + random() * 1.5
            + case
                when coalesce(vc.view_count, 0) >= 3 then
                  coalesce(vc.completion_rate, 0) * 4.0
                  + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
                else 0
              end
            + least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.12
            + case
                when f.follower_id is not null
                 and p.created_at > now() - interval '24 hours'  then 6.0
                when f.follower_id is not null
                 and p.created_at > now() - interval '72 hours'  then 3.0
                when coalesce(ucp.score, 0) >= 15
                 and p.created_at > now() - interval '48 hours'  then 4.0
                else 0
              end
          else
            -- No-tag: geen recency/likes/completion boosts; creator-context voor ordering
            random() * 0.5
            + case
                when f.follower_id is not null then 5.0
                when coalesce(ucp.score, 0) >= 15 then 3.0
                else 0.0
              end
        end
      )                                                   as base_score

    from public.posts p
    cross join current_user_id cu

    left join video_completion_stats vc
      on vc.post_id = p.id

    left join public.user_tag_preferences utp
      on utp.user_id = cu.user_id
     and utp.tag = any(coalesce(p.tags, '{}'::text[]))

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
      and not (p.id = any(coalesce(p_exclude_post_ids, '{}'::uuid[])))
      and (
        upvs.post_id is null
        or upvs.last_viewed_at < now() - interval '7 days'
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
      vc.completion_rate,
      ucp.score,
      f.follower_id
  ),

  ranked_posts as (
    select
      bs.id,
      bs.user_id,
      bs.type,
      bs.video_url,
      bs.r2_key,
      bs.thumbnail_url,
      bs.caption,
      bs.likes_count,
      bs.comments_count,
      bs.created_at,
      bs.tags,
      bs.tag_count,
      bs.is_followed,
      bs.creator_affinity,
      case
        when bs.tag_count = 0 then (bs.base_score * 0.1 - 10)::numeric
        else (bs.base_score + 1.0)::numeric
      end as ranking_score
    from base_scored bs
  ),

  tagged_ranked as (
    select
      rp.id,
      rp.user_id,
      rp.type,
      rp.video_url,
      rp.r2_key,
      rp.thumbnail_url,
      rp.caption,
      rp.likes_count,
      rp.comments_count,
      rp.created_at,
      rp.tags,
      rp.ranking_score
    from ranked_posts rp
    cross join effective_limit el
    where rp.tag_count > 0
    order by rp.ranking_score desc, rp.created_at desc
    limit (select lim from effective_limit)
  ),

  untagged_fallback as (
    select
      rp.id,
      rp.user_id,
      rp.type,
      rp.video_url,
      rp.r2_key,
      rp.thumbnail_url,
      rp.caption,
      rp.likes_count,
      rp.comments_count,
      rp.created_at,
      rp.tags,
      rp.ranking_score
    from ranked_posts rp
    cross join untagged_slot_limit usl
    where rp.tag_count = 0
      and (
        rp.is_followed
        or rp.creator_affinity >= 15
        or random() < 0.02
      )
    order by
      case
        when rp.is_followed then 0
        when rp.creator_affinity >= 15 then 1
        else 2
      end,
      random()
    limit (select slots from untagged_slot_limit)
  )

  select * from tagged_ranked
  union all
  select * from untagged_fallback;
$function$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
