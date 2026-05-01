-- Supabase: video post metadata (R2 holds binary; this table is source of truth for the app after refresh)
-- Run in: Supabase → SQL → New query

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  type text not null default 'video',
  video_url text not null,
  r2_key text not null,
  thumbnail_url text,
  filename text not null,
  caption text,
  likes_count int not null default 0,
  comments_count int not null default 0,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists posts_user_created_idx
  on public.posts (user_id, created_at desc)
  where is_deleted = false;

alter table public.posts enable row level security;

-- Tighten these when you add Supabase Auth. For a single “app user” with the anon key:
create policy "Allow read non-deleted posts"
  on public.posts
  for select
  using (is_deleted = false);

create policy "Allow insert post"
  on public.posts
  for insert
  with check (true);

create policy "Allow update own for soft delete"
  on public.posts
  for update
  using (true)
  with check (true);
