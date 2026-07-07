-- Timestamp when a follow request was accepted (activity feed for requester).

alter table public.follow_requests
  add column if not exists accepted_at timestamptz;

update public.follow_requests
set accepted_at = updated_at
where status = 'accepted'
  and accepted_at is null;

create index if not exists follow_requests_requester_accepted_idx
  on public.follow_requests (requester_id, accepted_at desc)
  where status = 'accepted' and accepted_at is not null;

comment on column public.follow_requests.accepted_at is
  'Wanneer de ontvanger het verzoek accepteerde; gebruikt voor requester activity feed.';

-- ---------------------------------------------------------------------------
-- accept_follow_request: set accepted_at once (idempotent on double-tap)
-- ---------------------------------------------------------------------------
create or replace function public.accept_follow_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid := auth.uid();
  v_requester uuid;
begin
  if v_recipient is null then
    raise exception 'Not authenticated';
  end if;

  select fr.requester_id
  into v_requester
  from public.follow_requests fr
  where fr.id = p_request_id
    and fr.recipient_id = v_recipient
    and fr.status = 'pending'
  for update;

  if v_requester is null then
    return false;
  end if;

  if public.follow_pair_blocked(v_recipient, v_requester) then
    update public.follow_requests
    set status = 'declined', updated_at = now()
    where id = p_request_id;
    return false;
  end if;

  insert into public.follows (follower_id, following_id)
  values (v_requester, v_recipient)
  on conflict do nothing;

  update public.follow_requests
  set
    status = 'accepted',
    updated_at = now(),
    accepted_at = now()
  where id = p_request_id
    and status = 'pending';

  return found;
end;
$$;

revoke all on function public.accept_follow_request(uuid) from public;
grant execute on function public.accept_follow_request(uuid) to authenticated;

notify pgrst, 'reload schema';
