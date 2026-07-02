# Supabase migration 0042 — remote validation record

**Project:** socialV2 (`mvngamvkdtcprgiizcvk`)  
**URL:** `https://mvngamvkdtcprgiizcvk.supabase.co`  
**Validated:** 2026-07-02  
**Branch:** `fix/prelaunch-p0-security`

## Push

```
npx supabase db push
Applying migration 0042_harden_feed_rpcs.sql...
Finished supabase db push.
```

Remote migration list: **0001–0042** (local = remote).

## Structural checks (postgres)

| Check | Result |
|-------|--------|
| `public.apply_tag_preference` / `apply_creator_affinity` removed | **PASS** |
| `private.apply_*` not executable by `authenticated`/`anon` | **PASS** (both false) |
| `get_personalized_feed` | auth=✓ anon=✗ |
| `get_explore_feed` | auth=✓ anon=✓ |
| `record_content_interactions` | auth=✓ anon=✗ |
| `record_video_view` | auth=✓ anon=✗ |
| RLS policies on preference tables | SELECT only (upsert policies removed) |

## Two-account integration (JWT simulation)

Accounts: **cantinaband** (`294fed69-…`) as A, **nicoisgay** (`3fc12b2a-…`) as B.

| Test | Result |
|------|--------|
| A direct INSERT into B `user_tag_preferences` | **PASS** — RLS denied |
| A direct INSERT into own `user_tag_preferences` | **PASS** — RLS denied |
| A SELECT own preferences | **PASS** — 22 rows |
| A `record_content_interactions` | **PASS** — inserted 1 |
| A `record_video_view` | **PASS** |
| A `get_personalized_feed(5)` | **PASS** — 5 rows |
| B `get_personalized_feed(5)` | **PASS** — 5 rows |
| B prefs after A hack attempt | **PASS** — no `rls_hack_test` row |
| `get_explore_feed(5)` | **PASS** — 5 rows |

## Client anon-key checks

| Test | Result |
|------|--------|
| RPC `apply_tag_preference` from client | **PASS** — function not found |
| RPC `apply_creator_affinity` from client | **PASS** — function not found |
| Anon `get_explore_feed(3)` | **PASS** — 3 rows |

Script: `scripts/verify-feed-rpc-security-remote.mjs`  
SQL: `supabase/scripts/verify_feed_rpc_security_remote.sql`

## Reels / feed status

Personalized feed, explore feed, interaction recording, and video view tracking all operational after 0042.
