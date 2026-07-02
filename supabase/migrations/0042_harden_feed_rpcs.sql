-- Harden feed ranking RPCs: internal preference writers, REVOKE/GRANT, read-only RLS.
-- Does not modify migrations 0001–0041; replaces insecure public apply_* entry points.

-- ---------------------------------------------------------------------------
-- 1. Private schema for server-only preference writers
-- ---------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- 2. Internal apply_tag_preference (never granted to authenticated/anon)
-- ---------------------------------------------------------------------------
create or replace function private.apply_tag_preference(
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

revoke all on function private.apply_tag_preference(uuid, text, numeric, integer, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Internal apply_creator_affinity (never granted to authenticated/anon)
-- ---------------------------------------------------------------------------
create or replace function private.apply_creator_affinity(
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

revoke all on function private.apply_creator_affinity(uuid, text, numeric, integer, integer, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Remove client-callable public apply_* entry points
-- ---------------------------------------------------------------------------
drop function if exists public.apply_tag_preference(uuid, text, numeric, integer, integer, integer);
drop function if exists public.apply_creator_affinity(uuid, text, numeric, integer, integer, integer, integer);

-- ---------------------------------------------------------------------------
-- 5. Point triggers / RPC callees at private helpers
-- ---------------------------------------------------------------------------
create or replace function public.trg_follows_creator_affinity()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if tg_op = 'INSERT' then
    perform private.apply_creator_affinity(new.follower_id, new.following_id::text, 15.0, 0, 0, 0, 1);
  elsif tg_op = 'DELETE' then
    perform private.apply_creator_affinity(old.follower_id, old.following_id::text, -15.0, 0, 0, 0, -1);
  end if;
  return null;
end;
$$;

create or replace function public.record_content_interactions(
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
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
          perform private.apply_tag_preference(v_user_id, rec.tag, -4, 0, 1, 1);
        end if;
      end loop;
      if v_creator is not null then
        perform private.apply_creator_affinity(v_user_id, v_creator, -1.5, 1, 0, 0, 0);
      end if;
    elsif v_type in ('viewed_100_percent', 'viewed_75_percent', 'viewed_50_percent', 'photo_dwell') then
      for rec in select distinct unnest(v_tags) as tag loop
        if rec.tag is null or length(trim(rec.tag)) = 0 then
          continue;
        end if;
        perform private.apply_tag_preference(
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
      perform private.apply_creator_affinity(v_user_id, v_creator, 2.0, 0, 0, 0, 0);
    end if;
  end loop;

  return jsonb_build_object('success', true, 'inserted', v_inserted);
end;
$$;

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
set search_path = public, private
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
    v_uid, p_post_id, v_watched_ms, coalesce(p_duration_ms, 0),
    v_watched_percent, v_completed
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
      perform private.apply_tag_preference(
        v_uid, rec.tag, v_tag_delta, v_pos, v_neg, 1
      );
    end loop;
  end if;

  if v_creator_id is not null then
    perform private.apply_creator_affinity(
      v_uid, v_creator_id, v_score_delta, 1,
      case when v_completed then 1 else 0 end, 0, 0
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. RLS: preferences read-only for clients (writes via SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------
drop policy if exists "Users upsert own tag preferences" on public.user_tag_preferences;

drop policy if exists "Users upsert own creator preferences" on public.user_creator_preferences;

-- ---------------------------------------------------------------------------
-- 7. REVOKE/GRANT hardening for feed RPCs (0039–0041)
-- ---------------------------------------------------------------------------

-- get_personalized_feed — authenticated only
revoke all on function public.get_personalized_feed(integer, uuid[]) from public;
revoke all on function public.get_personalized_feed(integer, uuid[]) from anon;
grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

-- get_explore_feed — guest + logged-in explore (anon + authenticated)
revoke all on function public.get_explore_feed(integer, uuid[]) from public;
grant execute on function public.get_explore_feed(integer, uuid[]) to anon, authenticated;

-- Client write RPCs — authenticated only
revoke all on function public.record_content_interactions(jsonb) from public;
revoke all on function public.record_content_interactions(jsonb) from anon;
grant execute on function public.record_content_interactions(jsonb) to authenticated;

revoke all on function public.record_video_view(uuid, integer, integer, numeric, boolean) from public;
revoke all on function public.record_video_view(uuid, integer, integer, numeric, boolean) from anon;
grant execute on function public.record_video_view(uuid, integer, integer, numeric, boolean) to authenticated;

notify pgrst, 'reload schema';
