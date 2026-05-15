-- Tag-voorkeurscore bij like (+8) / unlike (-8). Roept de app aan ná succesvolle post_likes mutatie.
-- Vereist: public.posts(id, tags text[]), public.user_tag_preferences met o.a.
--   user_id uuid, tag text, score, positive_views_count, negative_views_count, views_count,
--   last_interaction_at, unieke (user_id, tag).

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
  v_delta integer;
  rec record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.tags, '{}'::text[])
  into v_tags
  from public.posts p
  where p.id = p_post_id;

  if not found then
    v_tags := '{}'::text[];
  end if;

  v_delta := case when p_is_liked then 8 else -8 end;

  if v_tags is null or coalesce(cardinality(v_tags), 0) = 0 then
    return jsonb_build_object(
      'success', true,
      'post_id', p_post_id,
      'delta', v_delta,
      'tags', '[]'::jsonb
    );
  end if;

  for rec in
    select distinct unnest(v_tags) as tag
  loop
    if rec.tag is null or length(trim(rec.tag)) = 0 then
      continue;
    end if;

    insert into public.user_tag_preferences (
      user_id,
      tag,
      score,
      last_interaction_at
    )
    values (
      v_user_id,
      trim(rec.tag),
      v_delta,
      now()
    )
    on conflict (user_id, tag) do update
      set
        score = public.user_tag_preferences.score + excluded.score,
        last_interaction_at = excluded.last_interaction_at;
  end loop;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', v_delta,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

grant execute on function public.apply_post_like_preference(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
