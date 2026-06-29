import { supabase } from "../lib/supabase";

export type MusicTrack = {
  id: string;
  title: string;
  artist: string | null;
  coverUrl: string | null;
  audioUrl: string | null;
  durationMs: number | null;
  externalProvider: string | null;
  externalTrackId: string | null;
};

type MusicTrackRow = {
  id: string;
  title: string;
  artist: string | null;
  cover_url: string | null;
  audio_url: string | null;
  duration_ms: number | null;
  external_provider: string | null;
  external_track_id: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function mapMusicTrackRow(row: MusicTrackRow): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    coverUrl: row.cover_url,
    audioUrl: row.audio_url,
    durationMs: row.duration_ms,
    externalProvider: row.external_provider,
    externalTrackId: row.external_track_id,
  };
}

export async function fetchMusicTrackById(
  trackId: string
): Promise<MusicTrack | null> {
  if (!isUuid(trackId)) {
    return null;
  }
  const { data, error } = await supabase
    .from("music_tracks")
    .select(
      "id, title, artist, cover_url, audio_url, duration_ms, external_provider, external_track_id"
    )
    .eq("id", trackId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  return mapMusicTrackRow(data as MusicTrackRow);
}

export async function fetchMusicTracksByIds(
  trackIds: string[]
): Promise<Map<string, MusicTrack>> {
  const unique = Array.from(new Set(trackIds.filter(isUuid)));
  if (unique.length === 0) {
    return new Map();
  }
  const { data, error } = await supabase
    .from("music_tracks")
    .select(
      "id, title, artist, cover_url, audio_url, duration_ms, external_provider, external_track_id"
    )
    .in("id", unique)
    .eq("is_active", true);

  if (error) {
    if (__DEV__) {
      console.warn("[musicTracksService] fetch failed:", error.message);
    }
    return new Map();
  }

  return new Map(
    ((data ?? []) as MusicTrackRow[]).map((row) => [row.id, mapMusicTrackRow(row)])
  );
}
