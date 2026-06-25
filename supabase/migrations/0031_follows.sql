-- Follow relationships between profiles (volgen / ontvolgen).
-- Used by FeedItem, ProfileScreen, ActivityScreen, and block_user unfollow cleanup.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index if not exists follows_following_id_created_idx
  on public.follows (following_id, created_at desc);

create index if not exists follows_follower_id_created_idx
  on public.follows (follower_id, created_at desc);

comment on table public.follows is
  'Volgrelaties: follower_id volgt following_id. Publiek leesbaar; alleen eigen follows insert/delete.';

alter table public.follows enable row level security;

drop policy if exists "Public read follows" on public.follows;
create policy "Public read follows"
  on public.follows
  for select
  using (true);

drop policy if exists "Users insert own follows" on public.follows;
create policy "Users insert own follows"
  on public.follows
  for insert
  to authenticated
  with check (
    follower_id = auth.uid()
    and follower_id <> following_id
  );

drop policy if exists "Users delete own follows" on public.follows;
create policy "Users delete own follows"
  on public.follows
  for delete
  to authenticated
  using (follower_id = auth.uid());

notify pgrst, 'reload schema';
