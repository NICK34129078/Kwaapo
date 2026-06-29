-- Spotify / external music provider identity on music_tracks + related-posts index.

alter table public.music_tracks
  add column if not exists external_provider text null,
  add column if not exists external_track_id text null;

create unique index if not exists music_tracks_external_unique_idx
  on public.music_tracks (external_provider, external_track_id)
  where external_track_id is not null;

create index if not exists posts_audio_track_created_idx
  on public.posts (audio_track_id, created_at desc)
  where audio_track_id is not null and is_deleted = false;

comment on column public.music_tracks.external_provider is
  'External catalogue provider, e.g. spotify.';
comment on column public.music_tracks.external_track_id is
  'Provider-native track id (e.g. Spotify track id).';
