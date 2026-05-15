-- Hashtags voor Reels-aanbevelingen (opslag per post).
alter table public.posts
  add column if not exists tags text[] not null default '{}'::text[];
