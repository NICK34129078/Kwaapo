-- =============================================================================
-- debug_feed_tagged_only_RUN_IN_DASHBOARD.sql
-- Run in Supabase SQL Editor (authenticated context).
-- =============================================================================

select
  f.id,
  f.tags,
  cardinality(coalesce(f.tags, '{}'::text[])) as tag_count,
  f.ranking_score,
  f.created_at,
  (cardinality(coalesce(f.tags, '{}'::text[])) = 0) as is_controlled_no_tag_filler
from public.get_personalized_feed(10, '{}'::uuid[]) as f;

-- Verwacht:
--   • Meeste rijen tag_count > 0 (tagged_ranked)
--   • Max ~1–3 rijen is_controlled_no_tag_filler = true (untagged_fallback)
--   • Geen lange reeks no-tag rijen in RPC; client interleaved verder
