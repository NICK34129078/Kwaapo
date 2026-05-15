-- Image carousel: child media rows + nullable video_url for non-video posts.
-- Run in Supabase SQL editor or via CLI migrate.

-- Allow carousel rows without a video URL (video posts still set this field).
alter table public.posts alter column video_url drop not null;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  media_type text not null default 'image',
  url text not null,
  r2_key text,
  sort_order integer not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index if not exists post_media_post_order_idx
  on public.post_media (post_id, sort_order);

alter table public.post_media enable row level security;

drop policy if exists "post_media_select_authenticated" on public.post_media;

-- App reads carousel slides with the logged-in session (anon has no select).
create policy "post_media_select_authenticated"
  on public.post_media
  for select
  to authenticated
  using (true);
