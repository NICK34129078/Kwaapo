-- Interest-based Reels ranking: tables, interaction learning, ranked feed RPCs.
-- Fixes chronological feed when client merged a small RPC batch with Worker posts.

-- =============================================================================
-- user_tag_preferences (hashtag affinities)
-- =============================================================================
create table if not exists public.user_tag_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  tag text not null,
  score numeric not null default 0,
  positive_views_count integer not null default 0,
  negative_views_count integer not null default 0,
  views_count integer not null default 0,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_tag_preferences_pkey primary key (user_id, tag)
);

create index if not exists user_tag_preferences_user_score_idx
  on public.user_tag_preferences (user_id, score desc);

create index if not exists user_tag_preferences_tag_idx
  on public.user_tag_preferences (tag);

alter table public.user_tag_preferences enable row level security;

drop policy if exists "Users select own tag preferences" on public.user_tag_preferences;
create policy "Users select own tag preferences"
  on public.user_tag_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users upsert own tag preferences" on public.user_tag_preferences;
create policy "Users upsert own tag preferences"
  on public.user_tag_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- user_creator_preferences
-- =============================================================================
create table if not exists public.user_creator_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  creator_id text not null,
  score numeric not null default 0,
  views_count integer not null default 0,
  completed_views_count integer not null default 0,
  likes_count integer not null default 0,
  follows_count integer not null default 0,
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_creator_preferences_pkey primary key (user_id, creator_id)
);

create index if not exists user_creator_preferences_user_score_idx
  on public.user_creator_preferences (user_id, score desc);

create index if not exists user_creator_preferences_creator_idx
  on public.user_creator_preferences (creator_id);

alter table public.user_creator_preferences enable row level security;

drop policy if exists "Users select own creator preferences" on public.user_creator_preferences;
create policy "Users select own creator preferences"
  on public.user_creator_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users upsert own creator preferences" on public.user_creator_preferences;
create policy "Users upsert own creator preferences"
  on public.user_creator_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- user_post_view_state
-- =============================================================================
create table if not exists public.user_post_view_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  total_watched_ms integer not null default 0,
  last_viewed_at timestamptz not null default now(),
  constraint user_post_view_state_pkey primary key (user_id, post_id)
);

create index if not exists user_post_view_state_user_last_idx
  on public.user_post_view_state (user_id, last_viewed_at desc);

create index if not exists user_post_view_state_post_idx
  on public.user_post_view_state (post_id);

alter table public.user_post_view_state enable row level security;

drop policy if exists "Users manage own view state" on public.user_post_view_state;
create policy "Users manage own view state"
  on public.user_post_view_state for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- video_views
-- =============================================================================
create table if not exists public.video_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  watched_ms integer not null default 0,
  duration_ms integer not null default 0,
  watched_percent numeric,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists video_views_user_created_idx
  on public.video_views (user_id, created_at desc);

create index if not exists video_views_post_idx
  on public.video_views (post_id, created_at desc);

alter table public.video_views enable row level security;

drop policy if exists "Users insert own video views" on public.video_views;
create policy "Users insert own video views"
  on public.video_views for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users read own video views" on public.video_views;
create policy "Users read own video views"
  on public.video_views for select to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- content_interactions (audit + ranking debug)
-- =============================================================================
create table if not exists public.content_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  event_type text not null,
  watch_duration_ms integer,
  content_duration_ms integer,
  watch_percentage numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint content_interactions_event_type_check check (
    event_type in (
      'impression', 'view_started', 'viewed_25_percent', 'viewed_50_percent',
      'viewed_75_percent', 'viewed_100_percent', 'quick_skip', 'like', 'unlike',
      'comment', 'follow_creator', 'unfollow_creator', 'product_opened',
      'report', 'block_creator', 'photo_dwell', 'save', 'unsave'
    )
  )
);

create index if not exists content_interactions_user_created_idx
  on public.content_interactions (user_id, created_at desc);

create index if not exists content_interactions_post_idx
  on public.content_interactions (post_id, created_at desc);

create index if not exists content_interactions_user_post_event_idx
  on public.content_interactions (user_id, post_id, event_type, created_at desc);

alter table public.content_interactions enable row level security;

drop policy if exists "Users insert own content interactions" on public.content_interactions;
create policy "Users insert own content interactions"
  on public.content_interactions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users read own content interactions" on public.content_interactions;
create policy "Users read own content interactions"
  on public.content_interactions for select to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- apply_tag_preference helper
-- =============================================================================
create or replace function public.apply_tag_preference(
  p_user_id uuid,
  p_tag text,
  p_score_delta numeric,
  p_positive_delta integer default 0,
  p_negative_delta integer default 0,
  p_views_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text := lower(trim(coalesce(p_tag, '')));
  v_clamp_min constant numeric := -100;
  v_clamp_max constant numeric := 200;
begin
  if p_user_id is null or v_tag = '' then
    return;
  end if;

  insert into public.user_tag_preferences (
    user_id, tag, score, positive_views_count, negative_views_count,
    views_count, last_interaction_at, updated_at
  )
  values (
    p_user_id, v_tag,
    least(v_clamp_max, greatest(v_clamp_min, p_score_delta)),
    greatest(0, p_positive_delta),
    greatest(0, p_negative_delta),
    greatest(0, p_views_delta),
    now(), now()
  )
  on conflict (user_id, tag) do update
    set
      score = least(
        v_clamp_max,
        greatest(v_clamp_min, user_tag_preferences.score + excluded.score)
      ),
      positive_views_count = user_tag_preferences.positive_views_count + excluded.positive_views_count,
      negative_views_count = user_tag_preferences.negative_views_count + excluded.negative_views_count,
      views_count = user_tag_preferences.views_count + excluded.views_count,
      last_interaction_at = now(),
      updated_at = now();
end;
$$;

grant execute on function public.apply_tag_preference(uuid, text, numeric, integer, integer, integer)
  to authenticated, service_role;

-- =============================================================================
-- apply_creator_affinity helper
-- =============================================================================
create or replace function public.apply_creator_affinity(
  p_viewer_id uuid,
  p_creator_id text,
  p_score_delta numeric,
  p_views_delta integer default 0,
  p_completed_delta integer default 0,
  p_likes_delta integer default 0,
  p_follows_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clamp_min constant numeric := -50;
  v_clamp_max constant numeric := 100;
begin
  if p_viewer_id is null or p_creator_id is null or p_viewer_id::text = p_creator_id then
    return;
  end if;

  if p_score_delta = 0 and p_views_delta = 0 and p_completed_delta = 0
     and p_likes_delta = 0 and p_follows_delta = 0 then
    return;
  end if;

  insert into public.user_creator_preferences (
    user_id, creator_id, score, views_count, completed_views_count,
    likes_count, follows_count, last_interaction_at, updated_at
  )
  values (
    p_viewer_id, p_creator_id,
    least(v_clamp_max, greatest(v_clamp_min, p_score_delta)),
    greatest(0, p_views_delta), greatest(0, p_completed_delta),
    greatest(0, p_likes_delta), greatest(0, p_follows_delta),
    now(), now()
  )
  on conflict (user_id, creator_id) do update
    set
      score = least(v_clamp_max, greatest(v_clamp_min, user_creator_preferences.score + p_score_delta)),
      views_count = greatest(0, user_creator_preferences.views_count + p_views_delta),
      completed_views_count = greatest(0, user_creator_preferences.completed_views_count + p_completed_delta),
      likes_count = greatest(0, user_creator_preferences.likes_count + p_likes_delta),
      follows_count = greatest(0, user_creator_preferences.follows_count + p_follows_delta),
      last_interaction_at = now(),
      updated_at = now();
end;
$$;

grant execute on function public.apply_creator_affinity(uuid, text, numeric, integer, integer, integer, integer)
  to authenticated, service_role;

-- Follow trigger → creator affinity
create or replace function public.trg_follows_creator_affinity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_creator_affinity(new.follower_id, new.following_id::text, 15.0, 0, 0, 0, 1);
  elsif tg_op = 'DELETE' then
    perform public.apply_creator_affinity(old.follower_id, old.following_id::text, -15.0, 0, 0, 0, -1);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_follows_creator_affinity on public.follows;
create trigger trg_follows_creator_affinity
  after insert or delete on public.follows
  for each row execute function public.trg_follows_creator_affinity();

-- =============================================================================
-- record_content_interactions (batched client events)
-- =============================================================================
create or replace function public.record_content_interactions(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_event jsonb;
  v_post_id uuid;
  v_type text;
  v_watch_ms integer;
  v_duration_ms integer;
  v_watch_pct numeric;
  v_tags text[];
  v_creator text;
  rec record;
  v_inserted integer := 0;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('success', true, 'inserted', 0);
  end if;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_post_id := nullif(v_event->>'post_id', '')::uuid;
    v_type := lower(trim(coalesce(v_event->>'event_type', '')));
    if v_post_id is null or v_type = '' then
      continue;
    end if;

    v_watch_ms := coalesce((v_event->>'watch_duration_ms')::integer, 0);
    v_duration_ms := coalesce((v_event->>'content_duration_ms')::integer, 0);
    v_watch_pct := (v_event->>'watch_percentage')::numeric;

    insert into public.content_interactions (
      user_id, post_id, event_type, watch_duration_ms,
      content_duration_ms, watch_percentage, metadata
    )
    values (
      v_user_id, v_post_id, v_type, nullif(v_watch_ms, 0),
      nullif(v_duration_ms, 0), v_watch_pct,
      coalesce(v_event->'metadata', '{}'::jsonb)
    );
    v_inserted := v_inserted + 1;

    select coalesce(p.tags, '{}'::text[]), p.user_id
    into v_tags, v_creator
    from public.posts p
    where p.id = v_post_id;

    if v_type = 'quick_skip' then
      for rec in select distinct unnest(v_tags) as tag loop
        if rec.tag is not null and length(trim(rec.tag)) > 0 then
          perform public.apply_tag_preference(v_user_id, rec.tag, -4, 0, 1, 1);
        end if;
      end loop;
      if v_creator is not null then
        perform public.apply_creator_affinity(v_user_id, v_creator, -1.5, 1, 0, 0, 0);
      end if;
    elsif v_type in ('viewed_100_percent', 'viewed_75_percent', 'viewed_50_percent', 'photo_dwell') then
      for rec in select distinct unnest(v_tags) as tag loop
        if rec.tag is null or length(trim(rec.tag)) = 0 then
          continue;
        end if;
        perform public.apply_tag_preference(
          v_user_id,
          rec.tag,
          case v_type
            when 'viewed_100_percent' then 5.0
            when 'viewed_75_percent' then 3.0
            when 'viewed_50_percent' then 1.5
            else 2.0
          end,
          1, 0, 1
        );
      end loop;
    elsif v_type = 'product_opened' and v_creator is not null then
      perform public.apply_creator_affinity(v_user_id, v_creator, 2.0, 0, 0, 0, 0);
    end if;
  end loop;

  return jsonb_build_object('success', true, 'inserted', v_inserted);
end;
$$;

grant execute on function public.record_content_interactions(jsonb) to authenticated;

-- =============================================================================
-- record_video_view (tag + creator learning from watch behaviour)
-- =============================================================================
drop function if exists public.record_video_view(uuid, integer, integer, numeric, boolean);

create or replace function public.record_video_view(
  p_post_id uuid,
  p_watched_ms integer,
  p_duration_ms integer,
  p_watched_percent numeric,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_watched_ms integer;
  v_watched_percent numeric;
  v_completed boolean;
  v_updated int;
  v_creator_id text;
  v_tags text[];
  v_score_delta numeric;
  v_tag_delta numeric;
  v_pos integer := 0;
  v_neg integer := 0;
  rec record;
  v_quick_skip boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return;
  end if;

  if coalesce(p_duration_ms, 0) > 0 then
    v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), p_duration_ms);
  else
    v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), 120000);
  end if;

  if v_watched_ms < 500 then
    return;
  end if;

  if coalesce(p_duration_ms, 0) > 0 then
    v_watched_percent := least(100::numeric, greatest(0::numeric,
      (v_watched_ms::numeric / nullif(p_duration_ms, 0)::numeric) * 100));
  else
    v_watched_percent := p_watched_percent;
  end if;

  v_completed := coalesce(p_completed, false)
    or (v_watched_percent is not null and v_watched_percent >= 95);

  v_quick_skip := v_watched_ms < 2000
    and coalesce(v_watched_percent, 0) < 20;

  insert into public.video_views (
    user_id, post_id, watched_ms, duration_ms, watched_percent, completed
  )
  values (
    v_uid, p_post_id, v_watched_ms,
    coalesce(p_duration_ms, 0), v_watched_percent, v_completed
  );

  update public.user_post_view_state ups
  set total_watched_ms = coalesce(ups.total_watched_ms, 0) + v_watched_ms,
      last_viewed_at = now()
  where ups.user_id = v_uid and ups.post_id = p_post_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    insert into public.user_post_view_state (user_id, post_id, total_watched_ms, last_viewed_at)
    values (v_uid, p_post_id, v_watched_ms, now());
  end if;

  select user_id, coalesce(tags, '{}'::text[])
  into v_creator_id, v_tags
  from public.posts where id = p_post_id;

  if v_quick_skip then
    v_tag_delta := -4;
    v_neg := 1;
    v_score_delta := -1.5;
  elsif v_completed then
    v_tag_delta := 5;
    v_pos := 1;
    v_score_delta := 3.5;
  elsif coalesce(v_watched_percent, 0) >= 75 then
    v_tag_delta := 3;
    v_pos := 1;
    v_score_delta := 2.5;
  elsif coalesce(v_watched_percent, 0) >= 50 then
    v_tag_delta := 1;
    v_pos := 1;
    v_score_delta := 1.5;
  else
    v_tag_delta := 0.5;
    v_pos := 0;
    v_score_delta := 0.5;
  end if;

  if v_tags is not null and coalesce(cardinality(v_tags), 0) > 0 then
    for rec in select distinct unnest(v_tags) as tag loop
      if rec.tag is null or length(trim(rec.tag)) = 0 then
        continue;
      end if;
      perform public.apply_tag_preference(
        v_uid, rec.tag, v_tag_delta, v_pos, v_neg, 1
      );
    end loop;
  end if;

  if v_creator_id is not null then
    perform public.apply_creator_affinity(
      v_uid, v_creator_id, v_score_delta, 1,
      case when v_completed then 1 else 0 end, 0, 0
    );
  end if;
end;
$$;

grant execute on function public.record_video_view(uuid, integer, integer, numeric, boolean)
  to authenticated, service_role;

-- =============================================================================
-- get_explore_feed — ranked cold start (not chronological)
-- =============================================================================
drop function if exists public.get_explore_feed(integer, uuid[]);

create function public.get_explore_feed(
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
  scored as (
    select
      p.id, p.user_id, p.type, p.video_url, p.r2_key, p.thumbnail_url,
      p.caption, p.likes_count, p.comments_count, p.created_at,
      coalesce(p.tags, '{}'::text[]) as tags,
      cardinality(coalesce(p.tags, '{}'::text[])) as tag_count,
      p.user_id as creator_id,
      (
        least(coalesce(p.likes_count, 0), 50) * 0.2
        + least(coalesce(p.comments_count, 0), 30) * 0.25
        + greatest(0, 5 - extract(epoch from (now() - p.created_at)) / 86400)
        + random() * 2.0
        + case when coalesce(vc.view_count, 0) >= 3 then
            coalesce(vc.completion_rate, 0) * 5.0
            + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.03
          else 0 end
        + case when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then 2.0 else 0 end
      )::numeric as base_score
    from public.posts p
    left join video_completion_stats vc on vc.post_id = p.id
    where coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') in ('video', 'image_carousel')
      and not (p.id = any (select post_id from capped_exclude))
      and cardinality(coalesce(p.tags, '{}'::text[])) > 0
  ),
  with_penalty as (
    select
      s.*,
      case when s.tag_count = 0 then s.base_score * 0.1 - 10
           else s.base_score + 1.0 end as ranking_score,
      jsonb_build_object(
        'hashtag_interest', 0,
        'engagement', least(coalesce(s.likes_count, 0), 50) * 0.2,
        'freshness', greatest(0, 5 - extract(epoch from (now() - s.created_at)) / 86400),
        'exploration', random() * 2.0,
        'no_hashtag_penalty', case when s.tag_count = 0 then -10 else 0 end,
        'feed_source', 'explore_cold_start',
        'mode', 'explore_cold_start'
      ) as ranking_breakdown,
      row_number() over (partition by s.creator_id order by s.base_score desc) as creator_rank
    from scored s
  ),
  diversified as (
    select *,
      ranking_score - (greatest(0, creator_rank - 1) * 2.5) as final_score
    from with_penalty
  )
  select
    d.id, d.user_id, d.type, d.video_url, d.r2_key, d.thumbnail_url,
    d.caption, d.likes_count, d.comments_count, d.created_at, d.tags,
    d.final_score as ranking_score,
    d.ranking_breakdown
  from diversified d
  order by d.final_score desc, random()
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$function$;

grant execute on function public.get_explore_feed(integer, uuid[]) to anon, authenticated;

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
      when (select cnt from tagged_pool_count) >= ceil((select lim from effective_limit) * 0.6) then 1
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
