-- Feed learning single-owner:
-- `record_video_view` is de enige eigenaar van kijkgedrag-learning
-- (tag/creator-affiniteit). `record_content_interactions` logde dezelfde
-- signalen (milestones, quick_skip) nogmaals, waardoor een volledige view
-- ~+14.5 i.p.v. +5 per tag opleverde en een quick skip -8 i.p.v. -4.
-- Deze versie insert alleen nog audit-events; enkel `product_opened`
-- (niet gedekt door record_video_view) behoudt een affiniteitseffect.

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
  v_creator text;
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

    -- Kijkgedrag (milestones/quick_skip) scoort NIET meer hier:
    -- record_video_view past die learning al toe.
    if v_type = 'product_opened' then
      select p.user_id into v_creator
      from public.posts p
      where p.id = v_post_id;
      if v_creator is not null then
        perform public.apply_creator_affinity(v_user_id, v_creator, 2.0, 0, 0, 0, 0);
      end if;
    end if;
  end loop;

  return jsonb_build_object('success', true, 'inserted', v_inserted);
end;
$$;

grant execute on function public.record_content_interactions(jsonb) to authenticated;

notify pgrst, 'reload schema';
