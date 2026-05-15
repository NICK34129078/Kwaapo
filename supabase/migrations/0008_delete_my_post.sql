-- Soft-delete eigen post (video of image_carousel). Alleen ingelogde eigenaar.

create or replace function public.delete_my_post(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.posts
  set is_deleted = true
  where id = p_post_id
    and user_id = v_user_id::text
    and coalesce(is_deleted, false) = false;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return jsonb_build_object(
      'success', false,
      'reason', 'not_found_or_not_owner'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id
  );
end;
$$;

revoke all on function public.delete_my_post(uuid) from public;
grant execute on function public.delete_my_post(uuid) to authenticated;

notify pgrst, 'reload schema';
