# Changelog

All notable changes to Kwaapo are documented in this file.

The format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
- **Feed test coverage (gap #5)** — ranked-feed fallback ladder and
  GlobalFeedContext refresh/loadMore generation-guard logic are now unit-tested
  without React Native or Supabase. Ladder logic lives in
  `src/utils/rankedFeedLadder.ts` (injected fetchers + retries); refresh
  decisions in `src/utils/globalFeedRefresh.ts` (skip/empty/error/stale guard).
  `GlobalFeedContext` delegates to these helpers. Closes gap #5 of
  `.claude/feed_plan.md`.
  - Tests: `src/utils/rankedFeedLadder.test.ts`, `src/utils/globalFeedRefresh.test.ts`
  - Scripts: `npm run test:ranked-feed-ladder`, `npm run test:global-feed-refresh`,
    `npm run test:feed` (full feed suite)
- **Feed observability counters** — ranked-feed health is now measurable in
  production instead of only through `__DEV__` `console.log`. A dependency-free
  aggregator tracks source distribution (personalized / explore / empty),
  empty-feed rate, and RPC error rate across every feed fetch. An in-memory
  singleton flushes a compact summary on a fetch-count threshold (10) or time
  interval (60s) via a swappable sink (default `console.log`, replaceable by an
  analytics backend or a test spy). Closes gap #4 of `.claude/feed_plan.md`.
  - Client: `src/utils/feedTelemetry.ts` (pure), `src/services/feedObservability.ts`
    (singleton), wired in `src/context/GlobalFeedContext.tsx` (refresh + loadMore)
  - Tests: `src/utils/feedTelemetry.test.ts` (`npm run test:feed-telemetry`)
- **Feed comment learning** — posting a comment now feeds the feed ranking.
  New `apply_post_comment_preference` RPC scores tag +5 / creator +2 (between
  like ±4 and save ±6), applied server-side inside `add_post_comment` so it
  cannot be skipped by the client. A `comment` audit event is queued client-side
  for the `content_interactions` trail. Closes gap #1 (comment side) of
  `.claude/feed_plan.md`; follow learning was already handled by the
  `trg_follows_creator_affinity` trigger.
  - Migration: `supabase/migrations/20260710120000_feed_comment_learning.sql`
  - Client: `src/services/commentLearning.ts`, wired in `src/services/commentsService.ts`
  - Tests: `src/services/commentLearning.test.ts`
- **Feed creator-fatigue cap** — new client-side spacing pass caps consecutive
  posts from the same creator at 2. The server (`get_personalized_feed`) only
  soft-penalises repeat creators, so high-affinity creators could still cluster.
  The pass is order-preserving (moves a differing post forward by the minimum
  needed to break a run; never re-ranks by score/affinity) and boundary-aware on
  loadMore. Closes gap #2 of `.claude/feed_plan.md`.
  - Client: `src/utils/feedCreatorSpacing.ts`, wired in `src/context/GlobalFeedContext.tsx`
  - Tests: `src/utils/feedCreatorSpacing.test.ts`
- **Cold-start interest onboarding** — brand-new users are shown a one-time
  interest picker so their first personalized feed is tailored instead of
  generic. Selected tags seed `user_tag_preferences` (+12 each, clamped, reusing
  `apply_tag_preference`); options are data-driven (`get_popular_feed_tags`) with
  a curated fallback. Picker is gated to genuine cold-start (no prior tag
  preferences, not yet seeded/skipped) and shown once via a profile flag. Closes
  gap #3 of `.claude/feed_plan.md`.
  - Migration: `supabase/migrations/20260710130000_feed_cold_start_onboarding.sql`
    (adds `profiles.feed_interests_seeded_at`, `get_popular_feed_tags`,
    `needs_feed_interest_onboarding`, `seed_feed_interests`)
  - Client: `src/utils/feedInterests.ts`, `src/services/feedInterestsService.ts`,
    `src/screens/FeedInterestsOnboardingScreen.tsx`, gated in `App.tsx`
  - i18n: `feedInterests.*` keys in nl / en-US / de-DE
  - Tests: `src/utils/feedInterests.test.ts`
