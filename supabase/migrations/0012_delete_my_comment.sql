-- Soft-delete eigen comment + comments_count decrement.

create or replace function public.delete_my_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comment record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select c.id, c.user_id, c.post_id, c.is_deleted
  into v_comment
  from public.post_comments c
  where c.id = p_comment_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'comment_not_found');
  end if;

  if v_comment.user_id is distinct from v_uid then
    return jsonb_build_object('success', false, 'reason', 'not_owner');
  end if;

  if coalesce(v_comment.is_deleted, false) then
    return jsonb_build_object(
      'success', true,
      'reason', 'already_deleted',
      'comment_id', p_comment_id,
      'post_id', v_comment.post_id
    );
  end if;

  update public.post_comments
  set is_deleted = true
  where id = p_comment_id;

  update public.posts
  set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
  where id = v_comment.post_id;

  return jsonb_build_object(
    'success', true,
    'comment_id', p_comment_id,
    'post_id', v_comment.post_id
  );
end;
$$;

revoke all on function public.delete_my_comment(uuid) from public;
grant execute on function public.delete_my_comment(uuid) to authenticated;

notify pgrst, 'reload schema';
