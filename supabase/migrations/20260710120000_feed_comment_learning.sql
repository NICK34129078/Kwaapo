-- Comment-learning voor de feedranking (feed_plan.md gap #1).
--
-- Comments werden alleen als audit-event in content_interactions gelogd en
-- scoorden geen tag/creator-voorkeur — anders dan like/save (20260709100400)
-- en follows (trigger trg_follows_creator_affinity in 0039). Een comment is een
-- sterker expliciet signaal dan een like maar zwakker dan een save:
--   tag +5 (geclampt via apply_tag_preference), creator +2.
-- Additief-only: een verwijderde comment draait de voorkeur niet terug
-- (net als de follow-trigger, die enkel de relatie scoort).
--
-- De scoring gebeurt server-side binnen add_post_comment, zodat ze niet kan
-- worden overgeslagen door de client en in dezelfde round-trip gebeurt.

create or replace function public.apply_post_comment_preference(
  p_post_id uuid
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
    perform public.apply_tag_preference(v_user_id, rec.tag, 5, 0, 0, 0);
  end loop;

  -- apply_creator_affinity negeert self-affiniteit (viewer = creator).
  if v_creator is not null then
    perform public.apply_creator_affinity(v_user_id, v_creator, 2.0, 0, 0, 0, 0);
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', 5,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

grant execute on function public.apply_post_comment_preference(uuid) to authenticated;

-- add_post_comment: identiek aan 0011, met één toevoeging — na een geslaagde
-- insert wordt de comment-voorkeur toegepast.
create or replace function public.add_post_comment(
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  -- Feed-learning: comment scoort tag/creator-voorkeur (zie boven).
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

notify pgrst, 'reload schema';
