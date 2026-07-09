import { supabase } from "../lib/supabase";
import { addToBoundedSet } from "../utils/boundedSeenIds";

// Lokale uuid-check (zelfde regex als postLikesService.isPersistablePostId).
// Niet importeren uit postLikesService: die module queuet zelf events,
// en een require-cycle geeft Metro-warnings.
function isPersistablePostId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  );
}

export type ContentInteractionEventType =
  | "impression"
  | "view_started"
  | "viewed_25_percent"
  | "viewed_50_percent"
  | "viewed_75_percent"
  | "viewed_100_percent"
  | "quick_skip"
  | "like"
  | "unlike"
  | "comment"
  | "follow_creator"
  | "unfollow_creator"
  | "product_opened"
  | "report"
  | "block_creator"
  | "photo_dwell"
  | "save"
  | "unsave";

export type ContentInteractionEvent = {
  postId: string;
  eventType: ContentInteractionEventType;
  watchDurationMs?: number;
  contentDurationMs?: number;
  watchPercentage?: number;
  metadata?: Record<string, unknown>;
};

const FLUSH_MS = 1200;
const MAX_BATCH = 20;

let queue: ContentInteractionEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushInFlight = false;

function toRpcPayload(events: ContentInteractionEvent[]) {
  return events.map((e) => ({
    post_id: e.postId,
    event_type: e.eventType,
    ...(typeof e.watchDurationMs === "number"
      ? { watch_duration_ms: Math.round(e.watchDurationMs) }
      : {}),
    ...(typeof e.contentDurationMs === "number"
      ? { content_duration_ms: Math.round(e.contentDurationMs) }
      : {}),
    ...(typeof e.watchPercentage === "number"
      ? { watch_percentage: e.watchPercentage }
      : {}),
    ...(e.metadata ? { metadata: e.metadata } : {}),
  }));
}

async function flushContentInteractionQueue(): Promise<void> {
  if (flushInFlight || queue.length === 0) {
    return;
  }
  flushInFlight = true;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    const { error } = await supabase.rpc("record_content_interactions", {
      p_events: toRpcPayload(batch),
    });
    if (error && __DEV__) {
      console.warn("[ContentInteractions] flush failed:", error.message);
    }
  } catch (e) {
    if (__DEV__) {
      console.warn("[ContentInteractions] flush error:", e);
    }
  } finally {
    flushInFlight = false;
    if (queue.length > 0) {
      void flushContentInteractionQueue();
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer != null) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushContentInteractionQueue();
  }, FLUSH_MS);
}

export function queueContentInteraction(event: ContentInteractionEvent): void {
  if (!isPersistablePostId(event.postId)) {
    return;
  }
  queue.push(event);
  if (queue.length >= MAX_BATCH) {
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushContentInteractionQueue();
    return;
  }
  scheduleFlush();
}

export async function flushContentInteractionsNow(): Promise<void> {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushContentInteractionQueue();
}

/**
 * Milestone-events voor video (25/50/75/100%) — één keer per post per sessie.
 * Met `alreadySentOrder` wordt de dedup-set FIFO-begrensd (lange sessies).
 */
export function milestoneEventsForWatch(
  postId: string,
  watchedPercent: number,
  alreadySent: Set<string>,
  alreadySentOrder?: string[],
  maxTracked = 2000
): ContentInteractionEvent[] {
  const out: ContentInteractionEvent[] = [];
  const milestones: Array<{ key: string; type: ContentInteractionEventType; min: number }> = [
    { key: "25", type: "viewed_25_percent", min: 25 },
    { key: "50", type: "viewed_50_percent", min: 50 },
    { key: "75", type: "viewed_75_percent", min: 75 },
    { key: "100", type: "viewed_100_percent", min: 95 },
  ];
  for (const m of milestones) {
    const id = `${postId}:${m.key}`;
    if (alreadySent.has(id) || watchedPercent < m.min) {
      continue;
    }
    if (alreadySentOrder) {
      addToBoundedSet(alreadySent, alreadySentOrder, id, maxTracked);
    } else {
      alreadySent.add(id);
    }
    out.push({
      postId,
      eventType: m.type,
      watchPercentage: watchedPercent,
    });
  }
  return out;
}
