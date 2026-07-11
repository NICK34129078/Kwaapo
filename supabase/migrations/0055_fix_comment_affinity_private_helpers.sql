-- Fix comment (and like) feed-learning after 0042 moved apply_* helpers to private schema.
-- Remote had dashboard-only functions still calling public.apply_creator_affinity / apply_tag_preference.

-- ---------------------------------------------------------------------------
-- 1. Comment preference writer (server-only via add_post_comment)
-- ---------------------------------------------------------------------------
create or replace function public.apply_post_comment_preference(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_tags text[];
  v_creator text;
  rec record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.tags, '{}'::text[]), p.user_id
  into v_tags, v_creator
  from public.posts p
  where p.id = p_post_id;

  if not found then
    return jsonb_build_object('success', true, 'post_id', p_post_id, 'skipped', 'post_not_found');
  end if;

  for rec in select distinct unnest(v_tags) as tag loop
    if rec.tag is null or length(trim(rec.tag)) = 0 then
      continue;
    end if;
    perform private.apply_tag_preference(v_user_id, rec.tag, 5, 0, 0, 0);
  end loop;

  -- private.apply_creator_affinity ignores self-affiniteit (viewer = creator).
  if v_creator is not null then
    perform private.apply_creator_affinity(v_user_id, v_creator, 2.0, 0, 0, 0, 0);
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', 5,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

revoke all on function public.apply_post_comment_preference(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. add_post_comment — persist comment + feed-learning hook
-- ---------------------------------------------------------------------------
create or replace function public.add_post_comment(
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_comment_id uuid;
  v_created_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_body := left(trim(coalesce(p_body, '')), 300);
  if length(v_body) = 0 then
    return jsonb_build_object('success', false, 'reason', 'empty_body');
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and coalesce(p.is_deleted, false) = false
  ) then
    return jsonb_build_object('success', false, 'reason', 'post_not_found');
  end if;

  insert into public.post_comments (post_id, user_id, body)
  values (p_post_id, v_uid, v_body)
  returning id, created_at into v_comment_id, v_created_at;

  update public.posts
  set comments_count = coalesce(comments_count, 0) + 1
  where id = p_post_id;

  perform public.apply_post_comment_preference(p_post_id);

  return jsonb_build_object(
    'success', true,
    'id', v_comment_id,
    'post_id', p_post_id,
    'user_id', v_uid,
    'body', v_body,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.add_post_comment(uuid, text) from public;
grant execute on function public.add_post_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Like preference writer — client RPC after post_likes mutation
-- ---------------------------------------------------------------------------
create or replace function public.apply_post_like_preference(
  p_post_id uuid,
  p_is_liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_tags text[];
  v_creator text;
  v_delta integer;
  rec record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.tags, '{}'::text[]), p.user_id
  into v_tags, v_creator
  from public.posts p
  where p.id = p_post_id;

  if not found then
    v_tags := '{}'::text[];
    v_creator := null;
  end if;

  v_delta := case when p_is_liked then 8 else -8 end;

  if v_tags is not null and coalesce(cardinality(v_tags), 0) > 0 then
    for rec in select distinct unnest(v_tags) as tag loop
      if rec.tag is null or length(trim(rec.tag)) = 0 then
        continue;
      end if;
      perform private.apply_tag_preference(
        v_user_id,
        rec.tag,
        v_delta,
        case when p_is_liked then 1 else 0 end,
        case when p_is_liked then 0 else 1 end,
        0
      );
    end loop;
  end if;

  if v_creator is not null then
    perform private.apply_creator_affinity(
      v_user_id,
      v_creator,
      case when p_is_liked then 5.0 else -5.0 end,
      0,
      0,
      case when p_is_liked then 1 else -1 end,
      0
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', v_delta,
    'tags', to_jsonb(coalesce(v_tags, '{}'::text[]))
  );
end;
$$;

revoke all on function public.apply_post_like_preference(uuid, boolean) from public;
grant execute on function public.apply_post_like_preference(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Re-harden record_content_interactions (dashboard overwrite regression)
-- ---------------------------------------------------------------------------
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

revoke all on function public.record_content_interactions(jsonb) from public, anon;
grant execute on function public.record_content_interactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
