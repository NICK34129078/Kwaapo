-- Feed moderation: blocks, reports, not-interested signals + personalized feed filters.

-- =============================================================================
-- user_blocks
-- =============================================================================
create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint user_blocks_blocker_blocked_unique unique (blocker_id, blocked_id),
  constraint user_blocks_no_self_block check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx
  on public.user_blocks (blocker_id);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

comment on table public.user_blocks is
  'Gebruiker blokkeert andere gebruiker; feed en volgrelaties worden hierop gefilterd.';

alter table public.user_blocks enable row level security;

drop policy if exists "Users read own blocks" on public.user_blocks;
create policy "Users read own blocks"
  on public.user_blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "Users insert own blocks" on public.user_blocks;
create policy "Users insert own blocks"
  on public.user_blocks
  for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "Users delete own blocks" on public.user_blocks;
create policy "Users delete own blocks"
  on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = auth.uid());

-- =============================================================================
-- post_reports
-- =============================================================================
create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint post_reports_post_reporter_unique unique (post_id, reporter_id),
  constraint post_reports_reason_check check (
    reason in ('spam', 'ongepast', 'intimidatie', 'geweld', 'desinformatie', 'overig')
  ),
  constraint post_reports_status_check check (
    status in ('pending', 'reviewed', 'actioned', 'dismissed')
  )
);

create index if not exists post_reports_reporter_idx
  on public.post_reports (reporter_id, created_at desc);

create index if not exists post_reports_post_idx
  on public.post_reports (post_id, created_at desc);

comment on table public.post_reports is
  'Contentmeldingen per post. Status wordt later via service role gemodereerd.';

alter table public.post_reports enable row level security;

drop policy if exists "Users read own reports" on public.post_reports;
create policy "Users read own reports"
  on public.post_reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Users insert own reports" on public.post_reports;
create policy "Users insert own reports"
  on public.post_reports
  for insert
  to authenticated
  with check (reporter_id = auth.uid());

-- =============================================================================
-- feed_not_interested
-- =============================================================================
create table if not exists public.feed_not_interested (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint feed_not_interested_user_post_unique unique (user_id, post_id)
);

create index if not exists feed_not_interested_user_idx
  on public.feed_not_interested (user_id, created_at desc);

create index if not exists feed_not_interested_post_idx
  on public.feed_not_interested (post_id);

comment on table public.feed_not_interested is
  'Negatief feed-signaal: gebruiker wil deze post (en vergelijkbare tags) minder zien.';

alter table public.feed_not_interested enable row level security;

drop policy if exists "Users read own not interested" on public.feed_not_interested;
create policy "Users read own not interested"
  on public.feed_not_interested
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users insert own not interested" on public.feed_not_interested;
create policy "Users insert own not interested"
  on public.feed_not_interested
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users delete own not interested" on public.feed_not_interested;
create policy "Users delete own not interested"
  on public.feed_not_interested
  for delete
  to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- RPC: block_user
-- =============================================================================
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

  -- Blokkeren ontvolgt in beide richtingen.
  delete from public.follows
  where (follower_id = v_user_id and following_id = p_blocked_id)
     or (follower_id = p_blocked_id and following_id = v_user_id);

  return jsonb_build_object(
    'success', true,
    'blocked_id', p_blocked_id
  );
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

-- =============================================================================
-- RPC: unblock_user
-- =============================================================================
create or replace function public.unblock_user(p_blocked_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_blocks
  where blocker_id = v_user_id
    and blocked_id = p_blocked_id;

  get diagnostics v_deleted = row_count;

  return jsonb_build_object(
    'success', true,
    'blocked_id', p_blocked_id,
    'removed', v_deleted > 0
  );
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

-- =============================================================================
-- RPC: report_post
-- =============================================================================
create or replace function public.report_post(
  p_post_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := lower(trim(coalesce(p_reason, '')));
  v_details text := nullif(trim(coalesce(p_details, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_post_id is null then
    raise exception 'Invalid post';
  end if;

  if v_reason not in ('spam', 'ongepast', 'intimidatie', 'geweld', 'desinformatie', 'overig') then
    raise exception 'Invalid report reason';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and coalesce(p.is_deleted, false) = false
  ) then
    raise exception 'Post not found';
  end if;

  insert into public.post_reports (
    post_id,
    reporter_id,
    reason,
    details,
    status
  )
  values (
    p_post_id,
    v_user_id,
    v_reason,
    v_details,
    'pending'
  )
  on conflict (post_id, reporter_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.report_post(uuid, text, text) from public;
grant execute on function public.report_post(uuid, text, text) to authenticated;

-- =============================================================================
-- RPC: mark_not_interested
-- =============================================================================
create or replace function public.mark_not_interested(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tags text[];
  v_delta integer := -5;
  rec record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_post_id is null then
    raise exception 'Invalid post';
  end if;

  insert into public.feed_not_interested (user_id, post_id)
  values (v_user_id, p_post_id)
  on conflict (user_id, post_id) do nothing;

  select coalesce(p.tags, '{}'::text[])
  into v_tags
  from public.posts p
  where p.id = p_post_id;

  if not found then
    v_tags := '{}'::text[];
  end if;

  if v_tags is not null and coalesce(cardinality(v_tags), 0) > 0 then
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
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta', v_delta,
    'tags', to_jsonb(coalesce(v_tags, '{}'::text[]))
  );
end;
$$;

revoke all on function public.mark_not_interested(uuid) from public;
grant execute on function public.mark_not_interested(uuid) to authenticated;

-- get_personalized_feed moderation filters: see 0032_personalized_feed_moderation_filters.sql
-- (prod may use creator-affinity variant from dashboard; do not overwrite here).

notify pgrst, 'reload schema';
