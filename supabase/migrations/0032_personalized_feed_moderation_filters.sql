-- Add block + not-interested filters to creator-affinity get_personalized_feed (prod dashboard setup).
-- Skips when user_creator_preferences is absent (greenfield without affinity).

do $do$
begin
  if to_regclass('public.user_creator_preferences') is null then
    raise notice 'skip 0032 feed patch: user_creator_preferences not present';
    return;
  end if;
end;
$do$;

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
      p.user_id,
      p.type,
      p.video_url,
      p.r2_key,
      p.thumbnail_url,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.created_at,
      coalesce(p.tags, '{}') as tags,
      cardinality(coalesce(p.tags, '{}'::text[])) as tag_count,
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
      and not (p.id = any(coalesce(p_exclude_post_ids, '{}'::uuid[])))
      and (
        upvs.post_id is null
        or upvs.last_viewed_at < now() - interval '7 days'
      )
      and (
        cardinality(coalesce(p.tags, '{}'::text[])) > 0
        or random() < 0.05
      )
      and not exists (
        select 1
        from public.user_blocks b
        where b.blocker_id = cu.user_id
          and b.blocked_id::text = p.user_id
      )
      and not exists (
        select 1
        from public.feed_not_interested fni
        where fni.user_id = cu.user_id
          and fni.post_id = p.id
      )
    group by
      p.id, p.user_id, p.type, p.video_url, p.r2_key, p.thumbnail_url,
      p.caption, p.likes_count, p.comments_count, p.created_at, p.tags,
      vc.view_count, vc.avg_watched_percent, vc.completion_rate,
      ucp.score, f.follower_id
  ),
  ranked_posts as (
    select
      id, user_id, type, video_url, r2_key, thumbnail_url, caption,
      likes_count, comments_count, created_at, tags,
      case
        when tag_count = 0 then (base_score * 0.1 - 10)::numeric
        else (base_score + 1.0)::numeric
      end as ranking_score
    from base_scored
  )
  select *
  from ranked_posts
  order by
    case when cardinality(coalesce(tags, '{}'::text[])) > 0 then 0 else 1 end asc,
    ranking_score desc,
    created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$function$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
