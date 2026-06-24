-- Share tracking: welk doel, welke post, optioneel welke gebruiker (geen externe app-data).

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  target text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_shares_post_idx
  on public.post_shares (post_id, created_at desc);

create index if not exists post_shares_user_idx
  on public.post_shares (user_id, created_at desc)
  where user_id is not null;

comment on table public.post_shares is
  'Lichte share-events per post/doel. Geen gevoelige data van externe apps.';

alter table public.post_shares enable row level security;

-- Iedereen mag tellen (aggregatie); geen rijen met PII nodig voor de app.
drop policy if exists "Public read post share counts" on public.post_shares;
create policy "Public read post share counts"
  on public.post_shares
  for select
  using (true);

-- Ingelogde gebruikers mogen een share-event schrijven (eigen user_id of anoniem via null).
drop policy if exists "Authenticated insert share events" on public.post_shares;
create policy "Authenticated insert share events"
  on public.post_shares
  for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());

-- Anonieme share-events (niet ingelogd): service role / later uitbreiden; voor nu ook via anon insert met user_id null.
drop policy if exists "Anon insert share without user" on public.post_shares;
create policy "Anon insert share without user"
  on public.post_shares
  for insert
  to anon
  with check (user_id is null);
