-- Follow requests for private accounts (pending ≠ follow; accept creates follows row).

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_requests_no_self check (requester_id <> recipient_id),
  constraint follow_requests_status_check check (
    status in ('pending', 'accepted', 'declined', 'cancelled')
  )
);

create unique index if not exists follow_requests_pending_unique_idx
  on public.follow_requests (requester_id, recipient_id)
  where status = 'pending';

create index if not exists follow_requests_recipient_pending_idx
  on public.follow_requests (recipient_id, created_at desc)
  where status = 'pending';

create index if not exists follow_requests_requester_idx
  on public.follow_requests (requester_id, recipient_id, status);

comment on table public.follow_requests is
  'Volgverzoeken voor privéaccounts. Alleen status accepted + follows-row geeft contenttoegang.';

alter table public.follow_requests enable row level security;

drop policy if exists "Users read own follow requests" on public.follow_requests;
create policy "Users read own follow requests"
  on public.follow_requests
  for select
  to authenticated
  using (
    requester_id = auth.uid()
    or recipient_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.follow_pair_blocked(
  p_user_a uuid,
  p_user_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks ub
    where (ub.blocker_id = p_user_a and ub.blocked_id = p_user_b)
       or (ub.blocker_id = p_user_b and ub.blocked_id = p_user_a)
  );
$$;

revoke all on function public.follow_pair_blocked(uuid, uuid) from public;
grant execute on function public.follow_pair_blocked(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- send_follow_request
-- ---------------------------------------------------------------------------
create or replace function public.send_follow_request(p_recipient_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_request_id uuid;
  v_is_private boolean;
begin
  if v_requester is null then
    raise exception 'Not authenticated';
  end if;
  if p_recipient_id is null or p_recipient_id = v_requester then
    raise exception 'Invalid recipient';
  end if;

  if public.follow_pair_blocked(v_requester, p_recipient_id) then
    raise exception 'blocked';
  end if;

  select coalesce(pr.is_private, false)
  into v_is_private
  from public.profiles pr
  where pr.id = p_recipient_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  if not v_is_private then
    raise exception 'Recipient is not private — use direct follow';
  end if;

  if exists (
    select 1 from public.follows f
    where f.follower_id = v_requester
      and f.following_id = p_recipient_id
  ) then
    raise exception 'Already following';
  end if;

  update public.follow_requests
  set status = 'cancelled', updated_at = now()
  where requester_id = v_requester
    and recipient_id = p_recipient_id
    and status = 'pending';

  insert into public.follow_requests (requester_id, recipient_id, status)
  values (v_requester, p_recipient_id, 'pending')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.send_follow_request(uuid) from public;
grant execute on function public.send_follow_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_follow_request
-- ---------------------------------------------------------------------------
create or replace function public.cancel_follow_request(p_recipient_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_updated int;
begin
  if v_requester is null then
    raise exception 'Not authenticated';
  end if;

  update public.follow_requests
  set status = 'cancelled', updated_at = now()
  where requester_id = v_requester
    and recipient_id = p_recipient_id
    and status = 'pending';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.cancel_follow_request(uuid) from public;
grant execute on function public.cancel_follow_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- accept_follow_request (transactional: follows insert + request accepted)
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
  set status = 'accepted', updated_at = now()
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.accept_follow_request(uuid) from public;
grant execute on function public.accept_follow_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decline_follow_request
-- ---------------------------------------------------------------------------
create or replace function public.decline_follow_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid := auth.uid();
  v_updated int;
begin
  if v_recipient is null then
    raise exception 'Not authenticated';
  end if;

  update public.follow_requests
  set status = 'declined', updated_at = now()
  where id = p_request_id
    and recipient_id = v_recipient
    and status = 'pending';

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.decline_follow_request(uuid) from public;
grant execute on function public.decline_follow_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_outgoing_follow_request_status
-- ---------------------------------------------------------------------------
create or replace function public.get_outgoing_follow_request_status(p_recipient_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select fr.status
  from public.follow_requests fr
  where fr.requester_id = auth.uid()
    and fr.recipient_id = p_recipient_id
    and fr.status = 'pending'
  limit 1;
$$;

revoke all on function public.get_outgoing_follow_request_status(uuid) from public;
grant execute on function public.get_outgoing_follow_request_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (optional; safe if publication missing)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'follow_requests'
  ) then
    null;
  elsif exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.follow_requests;
  end if;
exception
  when others then
    raise notice 'follow_requests realtime publication skipped: %', sqlerrm;
end;
$do$;

notify pgrst, 'reload schema';

-- Cancel pending follow requests when users block each other.
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

  if to_regclass('public.follow_requests') is not null then
    update public.follow_requests
    set status = 'declined', updated_at = now()
    where status = 'pending'
      and (
        (requester_id = v_user_id and recipient_id = p_blocked_id)
        or (requester_id = p_blocked_id and recipient_id = v_user_id)
      );
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
