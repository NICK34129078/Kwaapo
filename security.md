# Security Review — Kwaapo

**Scope:** Expo/React Native app + Cloudflare Worker + Supabase (Postgres/RLS) + Stripe Connect
**Date:** 2026-07-06 (rechecked 2026-07-07)
**Reviewer:** Senior penetration test (static review of source, config, dependencies, git history, SQL/RLS)

> **Second-pass recheck (2026-07-07):** re-verified all first-pass fixes and swept areas not
> covered initially (`worker-seller-readiness.js`, the `security definer` SQL functions,
> PostgREST `.or()` filter usage, deep-link config). Result: one new **Medium** bug found and
> fixed (#11, filter injection) and one new **Medium** issue flagged for you to reconcile (#12,
> protect-trigger vs. onboarding write path). The definer RPCs (`submit_moderation_report`,
> `request_account_deletion`, feed/affinity functions) use no dynamic SQL and are injection-safe;
> `worker-seller-readiness.js` is clean (service-role + `encodeURIComponent` on all ids).

---

## Overall posture

The core security architecture is **sound**. Identity is verified server-side from the
Supabase JWT (`worker-auth.js` → `/auth/v1/user`), never from client-supplied headers; the
service-role key lives only on the Worker; payment amounts are re-validated against the
product DB before charging; stock uses reservation RPCs; and sensitive profile columns are
protected by a DB trigger. No real secrets are committed to git.

The issues below are real but mostly bounded. **#1 and #2 should be fixed before launch.**

---

## Findings by severity

| #  | Severity   | Issue                                                             | Location |
|----|------------|-------------------------------------------------------------------|----------|
| 1  | **High** _(patched)_ | Any authenticated user can overwrite any other user's video       | `worker.js` (`handleVideoPut`) |
| 2  | **High** _(patched, needs migration applied)_ | All seller PII (email, KVK, home address) readable by any logged-in user | `migrations/0039_profiles_pii_column_lockdown.sql` |
| 3  | Medium _(patched)_ | Stripe webhook has no replay/timestamp check; non-constant-time compare | `worker-stripe.js` (`verifyStripeWebhook`) |
| 4  | Medium _(patched, needs binding provisioned)_ | No rate limiting anywhere (KVK paid API, uploads, Spotify) | `worker.js`, `wrangler.jsonc` |
| 5  | Medium _(mitigated)_ | RLS relies on manually-run `_RUN_IN_DASHBOARD.sql` files          | `supabase/*.sql` |
| 6  | Medium _(fixed: 0 critical/high remain)_ | Dependency vulns: was 1 critical, 4 high (all dev/build tooling)  | `package-lock.json` |
| 7  | Low _(needs manual rotation)_ | Live Spotify client secret in working-tree `.dev.vars`   | `.dev.vars` |
| 8  | Low _(patched)_ | Hardcoded KVK test API key in source                             | `worker-kvk.js` |
| 9  | Low/Info _(patched)_ | `.wrangler/` not gitignored; stray tracked files          | `.gitignore` |
| 10 | Info       | Verbose logging of userId/order data; CORS `*`                    | worker files |
| 11 | Medium _(patched, recheck)_ | PostgREST `.or()` filter injection in search              | `SearchScreen.tsx`, `productsService.ts` |
| 12 | Medium _(flagged, recheck)_ | Protect-trigger vs. onboarding write path inconsistency  | `protect_profile_sensitive_columns` / `updateMyBusinessInfo` |

---

## 1. Video overwrite — broken access control (High)

`handleVideoPut` (`worker.js:258`) accepts any well-formed key matching
`videos/<uuid>/<ts>-name.(mp4|mov)` and calls `env.VIDEOS.put(r2Key, …)`, which **overwrites**
an existing object. It never checks that the `<uuid>` (postId) in the key belongs to the
authenticated user. That key is exposed publicly in every feed item's `video_url`
(`?file=videos/<postId>/…`).

**Attack path:** Any logged-in user reads another creator's `video_url` from the public feed,
then issues `PUT ?videoPut=1&r2Key=<their key>` with their own valid token and arbitrary MP4
bytes. The victim's reel now serves attacker content (defacement / planting illegal content
under someone else's identity).

**Fix:**
- In `handleVideoPut` (and `handleUploadInit`), verify the post identified by the key's UUID
  is owned by `auth.userId` before writing — look up `posts.user_id` for that id.
- Reject a PUT whose key already exists: `env.VIDEOS.head(r2Key)` → return 409 if present.
- Best: bind uploads to a server-issued, single-use key rather than trusting a client-supplied
  `r2Key`.

**Status: PATCHED** (`worker.js`). `handleVideoPut` now (a) rejects the PUT with 403 if a post
already exists for the key's UUID and is owned by another user (`fetchExistingPostOwner`), and
(b) tags each stored object with `customMetadata.uploadedBy = auth.userId` and refuses to
overwrite an object owned by a different user. Legitimate same-user retries still succeed.

---

## 2. Seller PII exposed to all authenticated users (High — privacy/GDPR)

The `Profiles readable by authenticated` policy
(`supabase/prelaunch_compliance_RUN_IN_DASHBOARD.sql:431`) is **row-level only** — it has no
column restriction. Postgres RLS cannot filter columns, so any logged-in user can query the
public anon/PostgREST endpoint directly:

```
GET /rest/v1/profiles?select=business_email,kvk_number,business_street,business_house_number,business_postal_code,stripe_connect_account_id
```

for **every** profile row. For `seller_type = individual` sellers this leaks a personal home
address and email tied to a real name.

**Fix:**
- Do not expose the base `profiles` table to clients for these columns.
- Create a public **view** (or `security definer` function) returning only safe columns
  (username, display_name, avatar); grant SELECT on that view.
- Revoke broad SELECT on `public.profiles` from `authenticated`/`anon`.
- The Worker retains full access via the service role.
- Verify before launch — this is a breach-notification-class exposure.

**Status: PATCHED** (needs migration applied + app test). Implemented via column-level
privileges instead of a view, to avoid rewriting ~20 safe call sites:
- `supabase/migrations/0039_profiles_pii_column_lockdown.sql` — `REVOKE SELECT` on `profiles`,
  then `GRANT SELECT (…safe columns…)` to `authenticated`/`anon`. The sensitive columns
  (`business_email`, `business_phone`, `kvk_number`, `vat_number`, `business_street`,
  `business_house_number`, `business_postal_code`, `stripe_connect_account_id`) are no longer
  granted. Adds `get_my_seller_onboarding()` (SECURITY DEFINER, filtered to `auth.uid()`) so an
  owner can still read their own full record.
- Client repoints: `fetchMySellerOnboarding` → RPC; `updateMyBusinessInfo` /
  `markSellerPendingReview` re-read via the RPC (no sensitive RETURNING select);
  `fetchSellerOnboardingByProfileId` and the `productsService` seller lookup now select safe
  columns only. `tsc --noEmit` passes.
- **Must do before deploy:** apply migration 0039 in Supabase, then smoke-test seller
  onboarding, the product seller card, and checkout (buyer-side gate uses only the readiness
  booleans, which remain readable).

---

## 3. Stripe webhook replay + timing (Medium)

`verifyStripeWebhook` (`worker-stripe.js:835`) parses `t` and `v1` from the signature header
but never checks that `t` is recent, so a captured valid webhook can be **replayed**
indefinitely. The signature check is also a plain `expected !== v1` string compare (not
constant-time). Replay impact is partly mitigated by idempotency (order-already-paid check,
refund event-id dedup in the RPC), but `checkout.session.completed` replays could still
re-trigger side effects.

**Fix:**
- Reject events where `Math.abs(nowSeconds - t) > 300`.
- Compare signatures with a constant-time equality check.
- Or adopt Stripe's official `constructEventAsync`, which does both.

**Status: PATCHED** (`worker-stripe.js`). `verifyStripeWebhook` now rejects timestamps outside a
300s tolerance (replay protection), compares signatures with `timingSafeEqualHex`, and accepts
any of multiple `v1` signatures (secret rotation). Verified end-to-end: valid→200,
stale timestamp→400, bad signature→400, tampered body→400.

---

## 4. No rate limiting (Medium)

No handler is rate-limited.
- `handleKvkVerify` (`worker-kvk.js:294`) calls a **paid, quota-limited** external KVK API on
  every request — an attacker can exhaust quota / drive cost.
- Upload handlers only reject 0-byte bodies (no size cap) → R2 storage exhaustion.
- `handleSpotifySearch` proxies the Spotify API freely.

**Fix:** Add Cloudflare rate-limiting rules (or a KV / Durable-Object counter) per user/IP on
`kvkVerify`, `spotifySearch`, and the upload endpoints; enforce a maximum upload size.

**Status: PATCHED** (`worker.js` + `wrangler.jsonc`). Added `enforceRateLimit()` (keyed on
`CF-Connecting-IP`) guarding `kvkVerify` (5/min), `spotifySearch`/`spotifyResolveTrack`
(30/min), and every upload path incl. `videoPut` (40/min), returning 429 when exceeded. Three
`ratelimit` bindings (`KVK_LIMITER`, `SPOTIFY_LIMITER`, `UPLOAD_LIMITER`) are declared in
`wrangler.jsonc`. The helper fails **open** if a binding is absent, so local dev is unaffected.
Bindings take effect on the next `wrangler deploy`. (An explicit max upload-size cap is still
worth adding; R2 abuse is now bounded by the request-rate limit.)

---

## 5. Migrations applied by hand (Medium — process risk)

Many security-critical policies live in `*_RUN_IN_DASHBOARD.sql` files applied manually.
If, e.g., migration `0036`'s posts tightening was not run in production, the original `0001`
policy `Allow insert post … with check (true)` leaves `public.posts` **writable by anyone**
holding the (public) anon key. Manual application gives no guarantee that prod matches the repo.

**Fix:**
- Move these into the tracked `supabase/migrations/` sequence and use `supabase db push`.
- Verify live policies with `select * from pg_policies;` and confirm no `with check (true)` /
  `using (true)` write policies remain on `posts`, `orders`, `products`, `profiles`.

**Status: PARTIALLY MITIGATED.** The new PII lockdown (#2) was authored as a tracked migration
(`migrations/0039_…`) rather than a dashboard-only file, and `0036` already drops the permissive
`posts` policies. Fully closing this is operational: fold the remaining `*_RUN_IN_DASHBOARD.sql`
into the tracked migration sequence and run `select * from pg_policies;` against prod to confirm
no `using (true)`/`with check (true)` write policies survive. Requires DB access, so it's left
as a runbook step.

---

## 6. Dependencies (Medium)

`npm audit`: **25 vulnerabilities — 1 critical, 4 high, 16 moderate, 4 low.**

The critical (`shell-quote`) and highs (`xmldom`, `undici`, `ws`, `miniflare`, `postcss`) are
all in **dev / build tooling** (Expo CLI, Wrangler local dev). They do **not** ship in the app
bundle or the deployed Worker runtime, so real-world exposure is low.

The one runtime item worth acting on: `@supabase/supabase-js@2.45.4` pulls a low-severity
`@supabase/auth-js` path-routing advisory.

**Fix:** `npm audit fix`; bump `@supabase/supabase-js` to a current 2.x.

**Status: FIXED (critical/high cleared).** Ran `npm audit fix` — the critical (`shell-quote`)
and all four highs (`xmldom`, `undici`, `ws`, `miniflare`) are resolved. Down from 25 → 14
vulnerabilities, now **0 critical / 0 high** (12 moderate + 2 low remain). Every remaining item
is Expo/Metro build tooling that only resolves via `npm audit fix --force` (a breaking
`expo@57` upgrade); left for a deliberate, tested SDK bump since none ship in the app bundle or
the deployed Worker.

---

## 7. Spotify client secret in working tree (Low)

`.dev.vars:9` contains a live `SPOTIFY_CLIENT_SECRET`. The file is gitignored and **not**
committed, so it is not in the repo — but it is a real credential sitting on disk. Sensitivity
is low (client-credentials flow for public catalog search only).

**Fix:** Rotate it; keep production values only in `wrangler secret put`. `.dev.vars` is for
local dev only.

**Status: REQUIRES MANUAL ROTATION.** `.dev.vars` is gitignored and not committed, and no code
reads a hardcoded value. Rotating the actual credential is an external action in the Spotify
developer dashboard that I cannot perform — regenerate the client secret there, then update your
local `.dev.vars` and the production `wrangler secret`.

---

## 8. Hardcoded KVK test API key (Low)

`worker-kvk.js:10` hardcodes `KVK_TEST_API_KEY = "l7xx…"`. This is KVK's shared **public test
key**, so impact is negligible, but the pattern should not reach a real key.

**Fix:** Keep test keys out of source; require the key from env/secret in all modes.

**Status: PATCHED** (`worker-kvk.js`). Removed the `KVK_TEST_API_KEY` constant and its fallback;
`getKvkConfig` now requires `KVK_API_KEY` from env/secret in all modes (test keys go in
`.dev.vars`). Updated `.dev.vars.example` accordingly.

---

## 9. `.gitignore` gaps (Low/Info)

- `.wrangler/` is not ignored → risk of a future accidental secret commit from local dev state.
- `AGENTS.md` is listed in `.gitignore` but is **already tracked**, so the ignore has no effect.
  If it is meant to be private, run `git rm --cached AGENTS.md`.
- Stray files: `test.txt` ("dit is een test upload") and empty `thumbnailUrl` — remove.

**Fix:** Add `.wrangler/` to `.gitignore`; untrack `AGENTS.md` if intended private; delete
stray files.

**Status: PATCHED** (`.gitignore`). Added `.wrangler/`; removed the stray tracked files
`test.txt` and `thumbnailUrl` (`git rm --cached` + deleted). The misleading `AGENTS.md` line was
removed from `.gitignore` — the file is already tracked and contains no secrets (verified), so
the ignore was a no-op; left tracked intentionally. If you want it private instead, run
`git rm --cached AGENTS.md`.

---

## 10. Minor / informational

- Workers log `userId`, order ids, and order details to `console` — visible in Cloudflare logs.
  Low-value info leak; scrub or reduce in production.
- CORS `Access-Control-Allow-Origin: *` (`worker.js:44`) is acceptable here because auth is via
  Bearer token, not cookies (no CSRF vector). Informational only.
- Share page HTML (`worker.js:1402`) strips `<>&"` before interpolation — reasonable XSS
  mitigation for the current template. Prefer a proper HTML-encoder if the template grows.

---

## 11. PostgREST filter injection in search (Medium) — found & fixed on recheck

`SearchScreen.tsx` interpolated raw user input straight into a PostgREST `.or()` filter:

```ts
.or(`username.ilike.%${cleanValue}%,display_name.ilike.%${cleanValue}%`)
```

PostgREST treats `,` `(` `)` as filter/grouping syntax and `% _ *` as wildcards, so a search
string could break out of the intended two conditions and inject its own (e.g.
`x,account_type.eq.business`), enumerate on other granted columns, or force expensive queries.
`productsService.fetchShopProducts` had the same pattern (it stripped `%_` but not `,()`). RLS
and the #2 column lockdown bound the blast radius (sensitive columns can't be referenced), but
it's still improper neutralization (CWE-943).

**Status: PATCHED.** Added `src/utils/postgrestFilter.ts` →
`sanitizePostgrestFilterValue()` which strips `,()*%_\` and control characters. Applied in
`SearchScreen` and both `productsService` `.or()` calls. Verified: injection payloads
(`x,id.eq.…`, `foo),(username.ilike.…`, `%_*`) are neutralized; ordinary names pass through.

## 12. Protect-trigger vs. onboarding write path (Medium) — flagged on recheck

The `protect_profile_sensitive_columns` trigger blocks the `authenticated` role from changing
`kvk_number`, `kvk_verified_at`, `seller_onboarding_status`, and the `stripe_*` flags. But
`sellerOnboardingService.updateMyBusinessInfo` updates `kvk_number`, `kvk_verified_at`, and
`seller_onboarding_status` **directly** as that role. These two cannot both be true in a working
system, so exactly one of the following holds in production — verify which:

- **If the trigger is deployed:** first-time business onboarding throws `'kvk_number is
  read-only'` — a broken flow (correctness bug).
- **If the trigger is NOT deployed:** the control is absent, so a user could self-set
  `stripe_charges_enabled = true` / `seller_onboarding_status = 'verified'` on their own profile
  (privilege escalation to appear payout-ready). Impact is bounded because Stripe itself is the
  real gate on money movement (a destination charge to an account that isn't `charges_enabled`
  fails), but the app-level seller gates would be spoofable.

**Fix:** Route onboarding writes through a `security definer` RPC that sets
`app.bypass_profile_protect` transaction-locally (the same pattern `request_account_deletion`
already uses), and confirm the trigger is actually deployed. Requires DB access + app testing,
so left for you to reconcile rather than changed blind.

**Related (privacy):** `request_account_deletion` anonymizes username/display/bio but leaves
`business_email`, `kvk_number`, and the street address on the row. For GDPR erasure, ensure the
downstream deletion job scrubs those too.

---

## What is done right (keep it)

- Server-side JWT identity with strict UUID validation (`worker-auth.js`); no trust in client
  headers for identity.
- Service-role key confined to the Worker; anon key correctly public and RLS-gated.
- Stripe checkout re-computes price/fee from the product DB and rejects `buyer_id !== order.buyer_id`
  (`worker-stripe.js:944`).
- Destination charges via Stripe Connect; no IBAN/bank data stored in Supabase.
- `protect_profile_sensitive_columns` trigger blocks client edits to Stripe/KVK/moderation/
  deletion columns.
- Ownership-scoped RLS on posts/orders/likes/notifications (once migrations are applied).
- Payment integrity guard trigger and stock reservation RPCs restricted to `service_role`.

---

## Recommended priority order

1. **#1** — add ownership check / reject-overwrite on video PUT.
2. **#2** — restrict `profiles` reads to safe columns via a view.
3. **#3** — webhook timestamp tolerance + constant-time compare.
4. **#4** — rate limiting on KVK / uploads / Spotify.
5. **#5** — move RLS into tracked migrations and verify prod state.
6. **#6–#9** — `npm audit fix`, rotate Spotify secret, `.gitignore` cleanup.
