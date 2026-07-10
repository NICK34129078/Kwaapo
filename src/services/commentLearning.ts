import type { ContentInteractionEvent } from "./contentInteractionsService";

/**
 * Comment-learning weights. The SQL source of truth is migration
 * `20260710120000_feed_comment_learning.sql` (`apply_post_comment_preference`);
 * these constants mirror it so the ordering invariant is unit-testable
 * client-side. A comment is a stronger explicit signal than a like
 * (tag ±4 / creator ±2) but weaker than a save (tag ±6 / creator ±3):
 * tag +5 / creator +2. Additive-only — deleting a comment does not unwind
 * the preference (mirrors the follow trigger, which only scores the relationship).
 */
export const COMMENT_TAG_DELTA = 5;
export const COMMENT_CREATOR_DELTA = 2;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit-log event for a posted comment, or `null` for non-persistable
 * (placeholder) post ids. Preference scoring happens server-side inside
 * `add_post_comment`; this only feeds the `content_interactions` audit trail,
 * mirroring how like/save queue their own audit events.
 */
export function buildCommentInteractionEvent(
  postId: string
): ContentInteractionEvent | null {
  if (!UUID_RE.test(postId)) {
    return null;
  }
  return { postId, eventType: "comment" };
}
