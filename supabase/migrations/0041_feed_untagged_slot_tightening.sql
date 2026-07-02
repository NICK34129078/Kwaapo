-- Tighten untagged slot limits: 0 default, max 1 when >=6 tagged candidates, max 2 only when scarce.

-- =============================================================================
-- get_personalized_feed — full interest ranking
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
  created_at timestamptz,
  tags text[],
  ranking_score numeric,
  ranking_breakdown jsonb
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
  capped_exclude as (
    select unnest(
      case
        when coalesce(array_length(p_exclude_post_ids, 1), 0) <= 200
          then coalesce(p_exclude_post_ids, '{}'::uuid[])
        else p_exclude_post_ids[
          (coalesce(array_length(p_exclude_post_ids, 1), 0) - 199):
          coalesce(array_length(p_exclude_post_ids, 1), 0)
        ]
      end
    ) as post_id
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
      p.id, p.user_id, p.type, p.video_url, p.r2_key, p.thumbnail_url,
      p.caption, p.likes_count, p.comments_count, p.created_at,
      coalesce(p.tags, '{}'::text[]) as tags,
      cardinality(coalesce(p.tags, '{}'::text[])) as tag_count,
      (f.follower_id is not null) as is_followed,
      coalesce(ucp.score, 0) as creator_affinity,
      coalesce(sum(utp.score), 0) as hashtag_interest,
      least(coalesce(p.likes_count, 0), 50) * 0.15 as engagement_score,
      greatest(0, 5 - extract(epoch from (now() - p.created_at)) / 86400) as freshness_score,
      case
        when coalesce(vc.view_count, 0) >= 3 then
          coalesce(vc.completion_rate, 0) * 4.0
          + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
        else 0
      end as watch_score,
      least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.12 as creator_boost,
      case
        when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then
          case
            when f.follower_id is not null and p.created_at > now() - interval '24 hours' then 6.0
            when f.follower_id is not null and p.created_at > now() - interval '72 hours' then 3.0
            when coalesce(ucp.score, 0) >= 15 and p.created_at > now() - interval '48 hours' then 4.0
            else 0
          end
        else 0
      end as follow_recency_boost,
      case
        when cardinality(coalesce(p.tags, '{}'::text[])) > 0
         and coalesce(sum(utp.score), 0) <= 0 then random() * 2.5 + 1.0
        else 0
      end as exploration_score,
      random() * 1.5 as jitter_score,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'tag', pref.tag,
            'affinity', round(pref.score::numeric, 2),
            'negative_skips', pref.negative_views_count
          )
          order by pref.score desc
        )
        from unnest(coalesce(p.tags, '{}'::text[])) as post_tag(tag)
        join public.user_tag_preferences pref
          on pref.user_id = (select user_id from current_user_id)
         and pref.tag = post_tag.tag
      ), '[]'::jsonb) as tag_affinities,
      coalesce((
        select sum(pref.negative_views_count)::integer
        from unnest(coalesce(p.tags, '{}'::text[])) as post_tag(tag)
        join public.user_tag_preferences pref
          on pref.user_id = (select user_id from current_user_id)
         and pref.tag = post_tag.tag
      ), 0) as negative_skip_count
    from public.posts p
    cross join current_user_id cu
    left join video_completion_stats vc on vc.post_id = p.id
    left join public.user_tag_preferences utp
      on utp.user_id = cu.user_id and utp.tag = any(coalesce(p.tags, '{}'))
    left join public.user_post_view_state upvs
      on upvs.user_id = cu.user_id and upvs.post_id = p.id
    left join public.user_creator_preferences ucp
      on ucp.user_id = cu.user_id and ucp.creator_id = p.user_id
    left join public.follows f
      on f.follower_id = cu.user_id and f.following_id::text = p.user_id
    where coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') in ('video', 'image_carousel')
      and not (p.id = any (select post_id from capped_exclude))
      and not (p.id = any (coalesce(p_exclude_post_ids, '{}'::uuid[])))
      and (upvs.post_id is null or upvs.last_viewed_at < now() - interval '7 days')
      and not exists (
        select 1 from public.user_blocks b
        where b.blocker_id = cu.user_id and b.blocked_id::text = p.user_id
      )
      and not exists (
        select 1 from public.feed_not_interested fni
        where fni.user_id = cu.user_id and fni.post_id = p.id
      )
    group by
      p.id, p.user_id, p.type, p.video_url, p.r2_key, p.thumbnail_url,
      p.caption, p.likes_count, p.comments_count, p.created_at, p.tags,
      vc.view_count, vc.avg_watched_percent, vc.completion_rate,
      ucp.score, f.follower_id
  ),
  ranked_posts as (
    select
      bs.*,
      (
        bs.hashtag_interest + bs.engagement_score + bs.freshness_score
        + bs.watch_score + bs.creator_boost + bs.follow_recency_boost
        + bs.exploration_score + bs.jitter_score
      ) as raw_score,
      case
        when bs.tag_count = 0 then
          (bs.hashtag_interest + bs.creator_boost + bs.follow_recency_boost) * 0.1 - 12
        else
          bs.hashtag_interest + bs.engagement_score + bs.freshness_score
          + bs.watch_score + bs.creator_boost + bs.follow_recency_boost
          + bs.exploration_score + bs.jitter_score + 1.0
      end as ranking_score,
      jsonb_build_object(
        'hashtag_interest', round(bs.hashtag_interest::numeric, 2),
        'engagement', round(bs.engagement_score::numeric, 2),
        'freshness', round(bs.freshness_score::numeric, 2),
        'watch_score', round(bs.watch_score::numeric, 2),
        'creator_affinity', round(bs.creator_boost::numeric, 2),
        'follow_recency', round(bs.follow_recency_boost::numeric, 2),
        'exploration', round(bs.exploration_score::numeric, 2),
        'jitter', round(bs.jitter_score::numeric, 2),
        'no_hashtag_penalty', case when bs.tag_count = 0 then -12 else 0 end,
        'quick_skip_penalty', round((-4 * coalesce(bs.negative_skip_count, 0))::numeric, 2),
        'tag_affinities', bs.tag_affinities,
        'is_followed', bs.is_followed,
        'tag_count', bs.tag_count
      ) as ranking_breakdown
    from base_scored bs
  ),
  with_creator_penalty as (
    select
      rp.*,
      row_number() over (partition by rp.user_id order by rp.ranking_score desc) as creator_rank,
      rp.ranking_score - (greatest(0, row_number() over (
        partition by rp.user_id order by rp.ranking_score desc
      ) - 1) * 3.0) as diversified_score
    from ranked_posts rp
  ),
  tagged_ranked as (
    select
      w.id, w.user_id, w.type, w.video_url, w.r2_key, w.thumbnail_url,
      w.caption, w.likes_count, w.comments_count, w.created_at, w.tags,
      w.diversified_score as ranking_score,
      w.ranking_breakdown || jsonb_build_object(
        'creator_repeat_penalty', round((greatest(0, w.creator_rank - 1) * 3.0)::numeric, 2),
        'total', round(w.diversified_score::numeric, 2),
        'feed_source', 'personalized'
      ) as ranking_breakdown
    from with_creator_penalty w
    cross join effective_limit el
    where w.tag_count > 0
    order by w.diversified_score desc, random()
    limit (select lim from effective_limit)
  ),
  tagged_pool_count as (
    select count(*)::integer as cnt
    from with_creator_penalty
    where tag_count > 0
  ),
  untagged_slot_limit as (
    select case
      when (select cnt from tagged_pool_count) >= (select lim from effective_limit) then 0
      when (select cnt from tagged_pool_count) >= ((select lim from effective_limit) - 1) then 0
      when (select cnt from tagged_pool_count) >= 6 then 1
      else least(
        2,
        greatest(0, (select lim from effective_limit) - (select cnt from tagged_pool_count))
      )
    end::integer as slots
  ),
  untagged_fallback as (
    select
      w.id, w.user_id, w.type, w.video_url, w.r2_key, w.thumbnail_url,
      w.caption, w.likes_count, w.comments_count, w.created_at, w.tags,
      w.diversified_score as ranking_score,
      w.ranking_breakdown || jsonb_build_object(
        'creator_repeat_penalty', round((greatest(0, w.creator_rank - 1) * 3.0)::numeric, 2),
        'total', round(w.diversified_score::numeric, 2),
        'untagged_fallback', true,
        'feed_source', 'personalized'
      ) as ranking_breakdown
    from with_creator_penalty w
    cross join untagged_slot_limit usl
    where w.tag_count = 0
      and (select slots from untagged_slot_limit) > 0
      and (w.is_followed or w.creator_affinity >= 15 or random() < 0.02)
    order by
      case when w.is_followed then 0 when w.creator_affinity >= 15 then 1 else 2 end,
      random()
    limit (select slots from untagged_slot_limit)
  )
  select * from tagged_ranked
  union all
  select * from untagged_fallback;
$function$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
