-- Like/save-learning voor de feedranking (review-punt A6).
--
-- 1) `apply_post_like_preference` (0005) schreef ±8 rechtstreeks naar
--    user_tag_preferences ZONDER de clamp van apply_tag_preference — like-spam
--    kon tagscores onbegrensd opdrijven — en deed niets met creator-affiniteit.
--    Nu: tag ±4 (geclampt), creator ±2 met likes_count-teller.
-- 2) Nieuw `apply_post_save_preference`: save is het sterkste expliciete
--    signaal → tag ±6, creator ±3.
-- Kijkgedrag-learning blijft eigendom van record_video_view (20260709100000);
-- deze functies scoren alleen expliciete acties die daar niet onder vallen.

create or replace function public.apply_post_like_preference(
  p_post_id uuid,
  p_is_liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tags text[];
  v_creator text;
  v_tag_delta numeric;
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

  v_tag_delta := case when p_is_liked then 4 else -4 end;

  for rec in select distinct unnest(v_tags) as tag loop
    if rec.tag is null or length(trim(rec.tag)) = 0 then
      continue;
    end if;
    perform public.apply_tag_preference(v_user_id, rec.tag, v_tag_delta, 0, 0, 0);
  end loop;

  if v_creator is not null then
    perform public.apply_creator_affinity(
      v_user_id, v_creator,
      case when p_is_liked then 2.0 else -2.0 end,
      0, 0,
      case when p_is_liked then 1 else -1 end,
      0
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', v_tag_delta,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

grant execute on function public.apply_post_like_preference(uuid, boolean) to authenticated;

create or replace function public.apply_post_save_preference(
  p_post_id uuid,
  p_is_saved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tags text[];
  v_creator text;
  v_tag_delta numeric;
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

  v_tag_delta := case when p_is_saved then 6 else -6 end;

  for rec in select distinct unnest(v_tags) as tag loop
    if rec.tag is null or length(trim(rec.tag)) = 0 then
      continue;
    end if;
    perform public.apply_tag_preference(v_user_id, rec.tag, v_tag_delta, 0, 0, 0);
  end loop;

  if v_creator is not null then
    perform public.apply_creator_affinity(
      v_user_id, v_creator,
      case when p_is_saved then 3.0 else -3.0 end,
      0, 0, 0, 0
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', v_tag_delta,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

grant execute on function public.apply_post_save_preference(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
