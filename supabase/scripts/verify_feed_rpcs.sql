-- Verify Reels ranking RPCs exist (run via Supabase SQL editor or psql).
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_personalized_feed',
    'get_explore_feed',
    'record_video_view',
    'record_content_interactions'
  )
order by p.proname;

-- Smoke: explore feed returns ranked rows (no auth required).
select id, tags, ranking_score, ranking_breakdown->>'feed_source' as feed_source
from public.get_explore_feed(5, '{}'::uuid[])
limit 5;
