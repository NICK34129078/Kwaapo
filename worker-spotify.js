/**
 * Spotify Web API — server-side catalog search & track resolve (preview URLs only).
 * Secrets: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 * Optional: SPOTIFY_MARKET (ISO country, default NL — required for Client Credentials search)
 * Preview URLs: nieuwe apps krijgen geen preview_url via Web API (nov 2024); worker vult aan via embed-pagina.
 */

import { requireAuthUser } from "./worker-auth.js";

/** @type {{ token: string; expiresAtMs: number } | null} */
let spotifyTokenCache = null;

const DEFAULT_SPOTIFY_MARKET = "NL";

function resolveSpotifyMarket(env) {
  const raw =
    typeof env?.SPOTIFY_MARKET === "string" ? env.SPOTIFY_MARKET.trim() : "";
  return /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : DEFAULT_SPOTIFY_MARKET;
}

function spotifyApiErrorMessage(json, fallback) {
  if (json && typeof json.error === "object" && json.error !== null) {
    const msg =
      typeof json.error.message === "string" ? json.error.message : "";
    const status =
      typeof json.error.status === "number" ? json.error.status : null;
    if (msg.length > 0) {
      return status != null ? `${msg} (${status})` : msg;
    }
  }
  if (json && typeof json.error_description === "string") {
    return json.error_description;
  }
  return fallback;
}

function jsonSpotify(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function getSupabaseBase(env) {
  return String(env.SUPABASE_URL || "").replace(/\/$/, "");
}

/**
 * @param {any} env
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {string} [jsonBody]
 */
async function supabaseRest(env, method, pathWithQuery, jsonBody) {
  const base = getSupabaseBase(env);
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (method === "GET") {
    delete headers["Content-Type"];
  }
  if (method === "POST" && jsonBody != null) {
    headers.Prefer = "return=representation";
  }
  const res = await fetch(`${base}/rest/v1${pathWithQuery}`, {
    method,
    headers,
    body: jsonBody != null ? jsonBody : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PostgREST ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!text || text.length === 0 || text === "null") {
    return null;
  }
  return JSON.parse(text);
}

/**
 * @param {any} env
 */
async function getSpotifyAccessToken(env) {
  const clientId = env.SPOTIFY_CLIENT_ID;
  const clientSecret = env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify is niet geconfigureerd op de server.");
  }

  const now = Date.now();
  if (spotifyTokenCache && spotifyTokenCache.expiresAtMs > now + 60_000) {
    return spotifyTokenCache.token;
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  if (!res.ok || typeof json.access_token !== "string") {
    const detail = spotifyApiErrorMessage(json, "Spotify-authenticatie mislukt.");
    console.error("[spotify] token failed", res.status, detail);
    throw new Error(detail);
  }
  const expiresIn =
    typeof json.expires_in === "number" && json.expires_in > 0
      ? json.expires_in
      : 3600;
  spotifyTokenCache = {
    token: json.access_token,
    expiresAtMs: now + expiresIn * 1000,
  };
  return json.access_token;
}

function applyPreviewUrl(normalized, previewUrl) {
  const url =
    typeof previewUrl === "string" && previewUrl.trim().length > 0
      ? previewUrl.trim()
      : null;
  if (!url) {
    return normalized;
  }
  return {
    ...normalized,
    previewUrl: url,
    hasPreview: true,
  };
}

/**
 * Nieuwe Spotify-apps (na nov 2024) krijgen geen preview_url via Web API.
 * Embed-pagina bevat wel audioPreview in __NEXT_DATA__.
 * @param {string} spotifyTrackId
 */
async function fetchPreviewUrlFromEmbed(spotifyTrackId) {
  const id = String(spotifyTrackId || "").trim();
  if (!id || id.length > 64) {
    return null;
  }
  try {
    const res = await fetch(`https://open.spotify.com/embed/track/${encodeURIComponent(id)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KwaapoWorker/1.0; +https://kwaapo.app)",
        Accept: "text/html",
      },
    });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const marker = '<script id="__NEXT_DATA__" type="application/json">';
    const start = html.indexOf(marker);
    if (start < 0) {
      return null;
    }
    const jsonStart = start + marker.length;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonEnd < 0) {
      return null;
    }
    const data = JSON.parse(html.slice(jsonStart, jsonEnd));
    const url = data?.props?.pageProps?.state?.data?.entity?.audioPreview?.url;
    return typeof url === "string" && url.length > 0 ? url : null;
  } catch (err) {
    console.warn("[spotify] embed preview failed", spotifyTrackId, err);
    return null;
  }
}

/**
 * @param {ReturnType<typeof normalizeSpotifyTrack>} normalized
 */
async function enrichNormalizedWithEmbedPreview(normalized) {
  if (!normalized) {
    return null;
  }
  if (normalized.previewUrl) {
    return normalized;
  }
  const embedPreview = await fetchPreviewUrlFromEmbed(normalized.spotifyTrackId);
  return applyPreviewUrl(normalized, embedPreview);
}

/**
 * @param {any} track
 */
async function enrichTrackWithEmbedPreview(track) {
  const normalized = normalizeSpotifyTrack(track);
  return enrichNormalizedWithEmbedPreview(normalized);
}

/**
 * @param {any} track
 */
function normalizeSpotifyTrack(track) {
  if (!track || typeof track.id !== "string") {
    return null;
  }
  const artists = Array.isArray(track.artists)
    ? track.artists
        .map((a) => (a && typeof a.name === "string" ? a.name : ""))
        .filter((n) => n.length > 0)
        .join(", ")
    : "";
  const images = track.album?.images;
  const coverUrl =
    Array.isArray(images) && images[0] && typeof images[0].url === "string"
      ? images[0].url
      : null;
  return {
    spotifyTrackId: track.id,
    title: typeof track.name === "string" ? track.name : "Onbekend nummer",
    artist: artists.length > 0 ? artists : "Onbekende artiest",
    coverUrl,
    previewUrl:
      typeof track.preview_url === "string" && track.preview_url.length > 0
        ? track.preview_url
        : null,
    durationMs:
      typeof track.duration_ms === "number" && track.duration_ms > 0
        ? Math.floor(track.duration_ms)
        : null,
    hasPreview:
      typeof track.preview_url === "string" && track.preview_url.length > 0,
  };
}

/**
 * @param {any} env
 * @param {ReturnType<typeof normalizeSpotifyTrack>} normalized
 */
async function upsertSpotifyMusicTrack(env, normalized) {
  const existing = await supabaseRest(
    env,
    "GET",
    `/music_tracks?external_provider=eq.spotify&external_track_id=eq.${encodeURIComponent(
      normalized.spotifyTrackId
    )}&select=id,title,artist,audio_url,cover_url,duration_ms,is_active`
  );
  const rowPayload = {
    title: normalized.title,
    artist: normalized.artist,
    audio_url: normalized.previewUrl,
    cover_url: normalized.coverUrl,
    duration_ms: normalized.durationMs,
    source: "external",
    external_provider: "spotify",
    external_track_id: normalized.spotifyTrackId,
    usage_type: "licensed",
    is_active: true,
  };

  if (Array.isArray(existing) && existing[0]?.id) {
    const updated = await supabaseRest(
      env,
      "PATCH",
      `/music_tracks?id=eq.${existing[0].id}&select=id,title,artist,audio_url,cover_url,duration_ms`,
      JSON.stringify(rowPayload)
    );
    const saved = Array.isArray(updated) ? updated[0] : existing[0];
    return saved;
  }

  const inserted = await supabaseRest(
    env,
    "POST",
    "/music_tracks?select=id,title,artist,audio_url,cover_url,duration_ms",
    JSON.stringify(rowPayload)
  );
  const saved = Array.isArray(inserted) ? inserted[0] : inserted;
  return saved;
}

/**
 * @param {any} row
 * @param {ReturnType<typeof normalizeSpotifyTrack>} normalized
 */
function toClientTrack(row, normalized) {
  return {
    trackId: row?.id ?? null,
    spotifyTrackId: normalized.spotifyTrackId,
    title: row?.title ?? normalized.title,
    artist: row?.artist ?? normalized.artist,
    coverUrl: row?.cover_url ?? normalized.coverUrl,
    previewUrl: row?.audio_url ?? normalized.previewUrl,
    durationMs: row?.duration_ms ?? normalized.durationMs,
    hasPreview:
      typeof (row?.audio_url ?? normalized.previewUrl) === "string" &&
      (row?.audio_url ?? normalized.previewUrl).length > 0,
  };
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {Record<string, string>} cors
 */
export async function handleSpotifySearch(request, env, cors) {
  const auth = await requireAuthUser(request, env, cors);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return jsonSpotify({ tracks: [] }, 200, cors);
  }

  const limitRaw = Number(url.searchParams.get("limit") || "10");
  const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 10), 10);

  try {
    const token = await getSpotifyAccessToken(env);
    const market = resolveSpotifyMarket(env);
    const searchUrl = new URL("https://api.spotify.com/v1/search");
    searchUrl.searchParams.set("q", q);
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", String(limit));
    searchUrl.searchParams.set("market", market);

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) {
      const detail = spotifyApiErrorMessage(
        json,
        "Spotify-zoekopdracht mislukt. Probeer het opnieuw."
      );
      console.error("[spotify] search failed", res.status, market, detail);
      return jsonSpotify({ error: detail }, res.status >= 400 && res.status < 500 ? res.status : 502, cors);
    }

    const items = json?.tracks?.items;
    const normalized = (Array.isArray(items) ? items : [])
      .map(normalizeSpotifyTrack)
      .filter(Boolean);
    const tracks = (
      await Promise.all(normalized.map((track) => enrichNormalizedWithEmbedPreview(track)))
    ).filter(Boolean);

    return jsonSpotify({ tracks }, 200, cors);
  } catch (err) {
    console.error("[spotify] search", err);
    return jsonSpotify(
      {
        error:
          (err && err.message) ||
          "Spotify-zoekopdracht mislukt. Probeer het opnieuw.",
      },
      500,
      cors
    );
  }
}

/**
 * @param {Request} request
 * @param {any} env
 * @param {Record<string, string>} cors
 */
export async function handleSpotifyResolveTrack(request, env, cors) {
  const auth = await requireAuthUser(request, env, cors);
  if (auth.error) {
    return auth.error;
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonSpotify({ error: "Ongeldig verzoek." }, 400, cors);
  }

  const spotifyTrackId =
    typeof body.spotifyTrackId === "string" ? body.spotifyTrackId.trim() : "";
  if (!spotifyTrackId || spotifyTrackId.length > 64) {
    return jsonSpotify({ error: "Ongeldig Spotify-nummer." }, 400, cors);
  }

  try {
    const token = await getSpotifyAccessToken(env);
    const market = resolveSpotifyMarket(env);
    const res = await fetch(
      `https://api.spotify.com/v1/tracks/${encodeURIComponent(spotifyTrackId)}?market=${encodeURIComponent(market)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const json = await res.json();
    if (!res.ok) {
      const detail = spotifyApiErrorMessage(json, "Nummer niet gevonden op Spotify.");
      return jsonSpotify(
        { error: detail },
        res.status === 404 ? 404 : 502,
        cors
      );
    }

    let normalized = normalizeSpotifyTrack(json);
    if (!normalized) {
      return jsonSpotify({ error: "Ongeldig Spotify-antwoord." }, 502, cors);
    }
    normalized = await enrichNormalizedWithEmbedPreview(normalized);
    if (!normalized?.previewUrl) {
      return jsonSpotify(
        {
          error:
            "Dit nummer heeft geen preview beschikbaar. Kies een ander nummer.",
        },
        400,
        cors
      );
    }

    const row = await upsertSpotifyMusicTrack(env, normalized);
    if (!row?.id) {
      return jsonSpotify(
        { error: "Nummer opslaan mislukt. Probeer het opnieuw." },
        500,
        cors
      );
    }

    return jsonSpotify({ track: toClientTrack(row, normalized) }, 200, cors);
  } catch (err) {
    console.error("[spotify] resolve", err);
    return jsonSpotify(
      {
        error:
          (err && err.message) ||
          "Nummer laden mislukt. Probeer het opnieuw.",
      },
      500,
      cors
    );
  }
}
