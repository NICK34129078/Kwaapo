-- Security verification for migration 0042_harden_feed_rpcs.sql
-- Run in Supabase SQL editor AFTER applying 0042, or via psql against local reset DB.
--
-- Manual cross-user RPC test (requires two real auth user UUIDs):
--   1. As User A JWT (client): rpc apply_tag_preference should NOT exist (404 / function not found)
--   2. As User A: record_content_interactions with own events should succeed
--   3. As User A: direct insert into user_tag_preferences should fail (RLS)

-- ---------------------------------------------------------------------------
-- A. Public apply_* entry points must be gone
-- ---------------------------------------------------------------------------
select
  case
    when count(*) = 0 then 'PASS: no public apply_tag_preference / apply_creator_affinity'
    else 'FAIL: public apply_* still callable'
  end as check_public_apply_removed
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_tag_preference', 'apply_creator_affinity');

-- ---------------------------------------------------------------------------
-- B. Private helpers exist and are not granted to authenticated/anon
-- ---------------------------------------------------------------------------
select
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname in ('apply_tag_preference', 'apply_creator_affinity')
order by p.proname;

-- Expected: authenticated_can_execute = false, anon_can_execute = false

-- ---------------------------------------------------------------------------
-- C. Feed RPC grants
-- ---------------------------------------------------------------------------
select
  p.proname as function_name,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon
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

-- Expected:
--   get_personalized_feed: auth=true, anon=false
--   get_explore_feed: auth=true, anon=true
--   record_*: auth=true, anon=false

-- ---------------------------------------------------------------------------
-- D. RLS: upsert policies removed on preference tables
-- ---------------------------------------------------------------------------
select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('user_tag_preferences', 'user_creator_preferences')
order by tablename, policyname;

-- Expected: only SELECT policies for authenticated own rows; no INSERT/UPDATE/ALL upsert

-- ---------------------------------------------------------------------------
-- E. Internal writer smoke (runs as postgres / service role in SQL editor)
-- Replace UUIDs with two test users when validating on remote.
-- ---------------------------------------------------------------------------
-- select private.apply_tag_preference(
--   '00000000-0000-0000-0000-000000000001'::uuid,
--   'securitytest',
--   1.0, 1, 0, 1
-- );
-- ---------------------------------------------------------------------------
-- F. Comment/like writers use private helpers (migration 0055)
-- ---------------------------------------------------------------------------
select
  p.proname as function_name,
  case
    when pg_get_functiondef(p.oid) ilike '%private.apply_creator_affinity%'
      and pg_get_functiondef(p.oid) not ilike '%public.apply_creator_affinity%'
      then 'PASS'
    else 'FAIL'
  end as uses_private_affinity
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'apply_post_comment_preference',
    'apply_post_like_preference',
    'add_post_comment',
    'record_content_interactions'
  )
order by p.proname;

-- apply_post_comment_preference must NOT be executable by clients
select
  p.proname,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'apply_post_comment_preference';
