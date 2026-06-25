import { supabase } from "../lib/supabase";

const MAX_WATCHED_MS_UNKNOWN_DURATION = 120_000;

/**
 * Begrenst `watched_ms` zodat timer-/achtergrond-artefacten de analytics niet vervuilen.
 * Bij bekende videolengte: max `durationMs`; anders max 2 minuten.
 */
export function capWatchedMs(rawWatchedMs: number, durationMs?: number): number {
  const raw = Number.isFinite(rawWatchedMs) ? rawWatchedMs : 0;
  const upper =
    typeof durationMs === "number" && durationMs > 0
      ? durationMs
      : MAX_WATCHED_MS_UNKNOWN_DURATION;
  return Math.max(0, Math.min(raw, upper));
}

/** Zelfde patroon als post-likes: alleen echte `uuid`-post-ids. */
function isValidPostUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

export async function recordVideoView({
  postId,
  watchedMs,
  durationMs,
  watchedPercent,
  completed,
}: {
  postId: string;
  watchedMs: number;
  durationMs?: number;
  watchedPercent?: number;
  completed?: boolean;
}): Promise<void> {
  if (!isValidPostUuid(postId)) {
    return;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return;
  }

  const cappedWatchedMs = capWatchedMs(
    watchedMs,
    typeof durationMs === "number" && durationMs > 0 ? durationMs : undefined
  );
  if (cappedWatchedMs < 500) {
    return;
  }

  const resolvedDurationMs =
    typeof durationMs === "number" && durationMs > 0 ? durationMs : 0;
  const resolvedPercent =
    typeof watchedPercent === "number"
      ? watchedPercent
      : resolvedDurationMs > 0
        ? Math.min(100, Math.max(0, (cappedWatchedMs / resolvedDurationMs) * 100))
        : 0;

  const { error } = await supabase.rpc("record_video_view", {
    p_post_id: postId,
    p_watched_ms: Math.round(cappedWatchedMs),
    p_duration_ms: Math.round(resolvedDurationMs),
    p_watched_percent: resolvedPercent,
    p_completed: completed ?? false,
  });

  if (error) {
    console.warn("[VideoViews] record failed:", error.message);
  }
}
