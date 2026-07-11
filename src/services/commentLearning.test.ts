import {
  COMMENT_CREATOR_DELTA,
  COMMENT_TAG_DELTA,
  buildCommentInteractionEvent,
} from "./commentLearning";

// Like/save-gewichten (SQL: 20260709100400_feed_like_save_learning.sql) —
// hier hard gecodeerd zodat de ordening-invariant lokaal te bewaken is.
const LIKE_TAG_DELTA = 4;
const LIKE_CREATOR_DELTA = 2;
const SAVE_TAG_DELTA = 6;
const SAVE_CREATOR_DELTA = 3;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runCommentLearningTests(): void {
  // Ordening-invariant: comment ligt tussen like en save (tag), creator ≥ like.
  assert(
    LIKE_TAG_DELTA < COMMENT_TAG_DELTA && COMMENT_TAG_DELTA < SAVE_TAG_DELTA,
    "comment tag delta must sit strictly between like and save"
  );
  assert(
    COMMENT_CREATOR_DELTA >= LIKE_CREATOR_DELTA &&
      COMMENT_CREATOR_DELTA <= SAVE_CREATOR_DELTA,
    "comment creator delta must sit within like..save range"
  );

  // Persisteerbare (uuid) post-id → audit-event met type "comment".
  const uuid = "11111111-2222-4333-8444-555555555555";
  const evt = buildCommentInteractionEvent(uuid);
  assert(evt !== null, "uuid post id should yield an interaction event");
  assert(evt!.postId === uuid, "event should carry the post id");
  assert(evt!.eventType === "comment", "event type should be comment");
  assert(
    evt!.watchDurationMs === undefined && evt!.metadata === undefined,
    "comment event should be minimal (no watch/meta fields)"
  );

  // Placeholder / niet-uuid id → geen event (voorkomt bogus audit-rijen).
  assert(
    buildCommentInteractionEvent("reel-1") === null,
    "placeholder id should not yield an event"
  );
  assert(
    buildCommentInteractionEvent("") === null,
    "empty id should not yield an event"
  );
  assert(
    buildCommentInteractionEvent(uuid.toUpperCase()) !== null,
    "uuid check should be case-insensitive"
  );
}

if (require.main === module) {
  runCommentLearningTests();
  console.log("commentLearning tests passed");
}
