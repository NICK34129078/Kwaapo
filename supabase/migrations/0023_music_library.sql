-- App music library foundation: searchable, royalty-free / licensed track catalogue.
-- Veilige basis die later aan een licensed music provider gekoppeld kan worden.

create extension if not exists pg_trgm;

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text null,
  audio_url text not null,
  cover_url text null,
  duration_ms int null,
  genre text null,
  mood text null,
  source text not null default 'app_library',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  usage_type text not null default 'royalty_free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.music_tracks
  drop constraint if exists music_tracks_source_check;

alter table public.music_tracks
  add constraint music_tracks_source_check
  check (source in ('app_library', 'licensed_provider', 'user_upload', 'external'));

alter table public.music_tracks
  drop constraint if exists music_tracks_usage_type_check;

alter table public.music_tracks
  add constraint music_tracks_usage_type_check
  check (usage_type in ('royalty_free', 'licensed', 'own_sound'));

alter table public.music_tracks
  drop constraint if exists music_tracks_duration_ms_check;

alter table public.music_tracks
  add constraint music_tracks_duration_ms_check
  check (duration_ms is null or duration_ms >= 0);

create index if not exists music_tracks_is_active_idx
  on public.music_tracks (is_active);

create index if not exists music_tracks_featured_idx
  on public.music_tracks (is_featured)
  where is_featured = true;

create index if not exists music_tracks_genre_idx
  on public.music_tracks (lower(genre));

create index if not exists music_tracks_mood_idx
  on public.music_tracks (lower(mood));

-- Trigram indexes voor snelle ilike-zoekopdrachten op titel/artiest.
create index if not exists music_tracks_title_trgm_idx
  on public.music_tracks using gin (lower(title) gin_trgm_ops);

create index if not exists music_tracks_artist_trgm_idx
  on public.music_tracks using gin (lower(coalesce(artist, '')) gin_trgm_ops);

comment on table public.music_tracks is
  'In-app muziekbibliotheek (royalty-free / licensed). Geen Spotify; audio_url verwijst naar storage bucket music-library of een licensed provider.';
comment on column public.music_tracks.source is
  'app_library | licensed_provider | user_upload | external';
comment on column public.music_tracks.usage_type is
  'royalty_free | licensed | own_sound';

-- updated_at automatisch bijwerken
create or replace function public.set_music_tracks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_music_tracks_updated_at on public.music_tracks;

create trigger trg_music_tracks_updated_at
  before update on public.music_tracks
  for each row
  execute function public.set_music_tracks_updated_at();

-- RLS: iedereen mag actieve tracks lezen; schrijven blijft voorbehouden aan service role/admin.
alter table public.music_tracks enable row level security;

drop policy if exists "Public read active music tracks" on public.music_tracks;

create policy "Public read active music tracks"
  on public.music_tracks
  for select
  using (is_active = true);

-- Geen public insert/update/delete policy: alleen service role (bypasst RLS) mag beheren.

-- Koppeling vanuit posts naar de officiele track (voorkomt fake client-URLs).
alter table public.posts
  add column if not exists audio_track_id uuid null
  references public.music_tracks (id) on delete set null;

create index if not exists posts_audio_track_id_idx
  on public.posts (audio_track_id);

comment on column public.posts.audio_track_id is
  'Optionele FK naar music_tracks wanneer audio_source = app_library.';

-- Storage bucket voor library-audio (public read, geen public upload).
insert into storage.buckets (id, name, public)
values ('music-library', 'music-library', true)
on conflict (id) do nothing;

drop policy if exists "Public read music library" on storage.objects;

create policy "Public read music library"
  on storage.objects
  for select
  using (bucket_id = 'music-library');

-- Bewust GEEN public insert/update/delete policy voor music-library:
-- uploads gebeuren handmatig via dashboard of service role.
