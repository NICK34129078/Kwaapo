import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { buildWorkerAuthHeaders } from "./workerRequest";

export type SpotifyTrackResult = {
  trackId: string | null;
  spotifyTrackId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  previewUrl: string | null;
  durationMs: number | null;
  hasPreview: boolean;
};

type WorkerJson = Record<string, unknown> & {
  error?: string;
  message?: string;
  tracks?: unknown[];
  track?: unknown;
};

function formatWorkerError(_json: WorkerJson, status: number): string {
  if (status === 401 || status === 403) {
    return "Je sessie is verlopen. Log opnieuw in.";
  }
  return "Spotify-zoekopdracht mislukt. Probeer het opnieuw.";
}

async function parseWorkerResponse(res: Response): Promise<WorkerJson> {
  const text = await res.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as WorkerJson;
  } catch {
    throw new Error(
      `Worker antwoord is geen JSON (${res.status}): ${text.slice(0, 280)}`
    );
  }
}

function normalizeTrack(raw: unknown): SpotifyTrackResult | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const spotifyTrackId =
    typeof row.spotifyTrackId === "string" ? row.spotifyTrackId : "";
  if (!spotifyTrackId) {
    return null;
  }
  return {
    trackId: typeof row.trackId === "string" ? row.trackId : null,
    spotifyTrackId,
    title:
      typeof row.title === "string" && row.title.length > 0
        ? row.title
        : "Onbekend nummer",
    artist:
      typeof row.artist === "string" && row.artist.length > 0
        ? row.artist
        : "Onbekende artiest",
    coverUrl: typeof row.coverUrl === "string" ? row.coverUrl : null,
    previewUrl: typeof row.previewUrl === "string" ? row.previewUrl : null,
    durationMs:
      typeof row.durationMs === "number" && row.durationMs > 0
        ? row.durationMs
        : null,
    hasPreview:
      row.hasPreview === true ||
      (typeof row.previewUrl === "string" && row.previewUrl.length > 0),
  };
}

async function workerGet<T>(query: string): Promise<T> {
  const headers = await buildWorkerAuthHeaders();
  const url = `${CLOUD_VIDEO_WORKER_BASE}?${query}`;
  const res = await fetch(url, { method: "GET", headers });
  const json = await parseWorkerResponse(res);
  if (!res.ok || typeof json.error === "string") {
    throw new Error(
      typeof json.error === "string" ? json.error : formatWorkerError(json, res.status)
    );
  }
  return json as T;
}

async function workerPost<T>(query: string, body: Record<string, unknown>): Promise<T> {
  const headers = await buildWorkerAuthHeaders({
    "Content-Type": "application/json",
  });
  const url = `${CLOUD_VIDEO_WORKER_BASE}?${query}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await parseWorkerResponse(res);
  if (!res.ok || typeof json.error === "string") {
    throw new Error(
      typeof json.error === "string" ? json.error : formatWorkerError(json, res.status)
    );
  }
  return json as T;
}

export async function searchSpotifyTracks(
  query: string,
  limit = 10
): Promise<SpotifyTrackResult[]> {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }
  const cap = Math.min(Math.max(1, limit), 10);
  const params = new URLSearchParams({
    spotifySearch: "1",
    q,
    limit: String(cap),
  });
  const json = await workerGet<{ tracks?: unknown[] }>(params.toString());
  if (!Array.isArray(json.tracks)) {
    return [];
  }
  return json.tracks
    .map(normalizeTrack)
    .filter((t): t is SpotifyTrackResult => t != null);
}

export async function resolveSpotifyTrack(
  spotifyTrackId: string
): Promise<SpotifyTrackResult> {
  const id = spotifyTrackId.trim();
  if (!id) {
    throw new Error("Ongeldig Spotify-nummer.");
  }
  const json = await workerPost<{ track?: unknown }>("spotifyResolveTrack=1", {
    spotifyTrackId: id,
  });
  const track = normalizeTrack(json.track);
  if (!track || !track.trackId) {
    throw new Error("Nummer laden mislukt. Probeer het opnieuw.");
  }
  return track;
}
