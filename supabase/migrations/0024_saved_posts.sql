-- Saved posts / bookmarks: gebruikers kunnen posts opslaan via het bookmark-icoon.
-- Voor nu zijn opgeslagen posts openbaar zichtbaar op het profiel.
-- Later uitbreidbaar met privacy (bijv. een visibility-kolom of profielinstelling).

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Eén save per (gebruiker, post).
alter table public.saved_posts
  drop constraint if exists saved_posts_user_post_unique;

alter table public.saved_posts
  add constraint saved_posts_user_post_unique unique (user_id, post_id);

-- Profiel-tab: nieuwste saves eerst, per gebruiker.
create index if not exists saved_posts_user_created_idx
  on public.saved_posts (user_id, created_at desc);

-- Tellingen / opzoeken per post.
create index if not exists saved_posts_post_idx
  on public.saved_posts (post_id);

comment on table public.saved_posts is
  'Opgeslagen posts (bookmarks). Voor nu openbaar leesbaar op profiel; later uitbreidbaar met privacy.';

-- RLS
alter table public.saved_posts enable row level security;

-- Iedereen mag saved_posts lezen: opgeslagen posts zijn voor nu openbaar zichtbaar op profiel.
drop policy if exists "Public read saved posts" on public.saved_posts;
create policy "Public read saved posts"
  on public.saved_posts
  for select
  using (true);

-- Authenticated users mogen alleen hun eigen saves toevoegen.
drop policy if exists "Users insert own saves" on public.saved_posts;
create policy "Users insert own saves"
  on public.saved_posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Authenticated users mogen alleen hun eigen saves verwijderen.
drop policy if exists "Users delete own saves" on public.saved_posts;
create policy "Users delete own saves"
  on public.saved_posts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Geen update policy nodig: een save wordt alleen aangemaakt of verwijderd.
