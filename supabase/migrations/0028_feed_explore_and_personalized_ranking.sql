-- Explore feed (anon + authenticated) and improved personalized ranking.
--
-- Prerequisites: some remote projects skipped earlier migrations (e.g. 0003).
alter table public.posts
  add column if not exists tags text[] not null default '{}'::text[];

drop function if exists public.get_explore_feed(integer, uuid[]);
create or replace function public.get_explore_feed(
  p_limit integer default 10,
  p_exclude_post_ids uuid[] default '{}'::uuid[]
)
returns setof public.posts
language sql
stable
security definer
set search_path = public
as $$
  with capped_exclude as (
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
  )
  select p.*
  from public.posts p
  where coalesce(p.is_deleted, false) = false
    and coalesce(p.type, 'video') in ('video', 'image_carousel')
    and not (p.id = any (select post_id from capped_exclude))
  order by
    case when coalesce(array_length(p.tags, 1), 0) > 0 then 0 else 1 end,
    p.created_at desc,
    p.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_explore_feed(integer, uuid[]) to anon;
grant execute on function public.get_explore_feed(integer, uuid[]) to authenticated;

drop function if exists public.get_personalized_feed(integer);
drop function if exists public.get_personalized_feed(integer, uuid[]);

create or replace function public.get_personalized_feed(
  p_limit integer default 10,
  p_exclude_post_ids uuid[] default '{}'::uuid[]
)
returns setof public.posts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with capped_exclude as (
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
  ranked as (
    select
      p.id as post_id,
      coalesce((
        select sum(utp.score)
        from unnest(coalesce(p.tags, '{}'::text[])) as t(tag)
        join public.user_tag_preferences utp
          on utp.user_id = auth.uid()
         and utp.tag = t.tag
      ), 0)::double precision as tag_score
    from public.posts p
    where coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') in ('video', 'image_carousel')
      and not (p.id = any (select post_id from capped_exclude))
      and not exists (
        select 1
        from public.user_post_view_state ups
        where ups.user_id = auth.uid()
          and ups.post_id = p.id
      )
  )
  select p.*
  from public.posts p
  inner join ranked r on r.post_id = p.id
  order by r.tag_score desc, p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
end;
$$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
