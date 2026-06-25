-- block_user: skip follows cleanup when follows table is absent (legacy remote setups).

create or replace function public.block_user(p_blocked_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_blocked_id is null or p_blocked_id = v_user_id then
    raise exception 'Invalid blocked user';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (v_user_id, p_blocked_id)
  on conflict (blocker_id, blocked_id) do nothing;

  if to_regclass('public.follows') is not null then
    delete from public.follows
    where (follower_id = v_user_id and following_id = p_blocked_id)
       or (follower_id = p_blocked_id and following_id = v_user_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'blocked_id', p_blocked_id
  );
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

notify pgrst, 'reload schema';
