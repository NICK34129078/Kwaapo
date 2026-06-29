# AGENTS.md — Kwaapo

Guidance for AI agents working in this repository.

## Tech stack

| Layer | Technology |
| --- | --- |
| App | Expo SDK ~54, React Native 0.81, React 19, TypeScript |
| Navigation | React Navigation (bottom tabs + native stack) — **not** Expo Router |
| Backend / DB | Supabase (Postgres, Auth, RLS, migrations in `supabase/migrations/`) |
| Edge / media | Cloudflare Workers (`worker.js`, `worker-stripe-connect.js`, `worker-seller-readiness.js`), R2 (`mijn-app-videos`) |
| Payments | Stripe Checkout + Stripe Connect |
| Verification | KVK API (Dutch business registry) |
| Deploy workers | Wrangler (`npm run deploy:worker`) |

## Common commands

- `npm start` — Expo dev server (LAN)
- `npm run web` / `npm run start:cursor` — web preview on port 8082
- `npm run supabase:push` — push local migrations to linked Supabase project
- `npm run deploy:worker` — deploy Cloudflare worker

## Agent skills

Project skills live in `.agents/skills/`. Locked versions are listed in `skills-lock.json`. **Read the relevant `SKILL.md` before implementing** — do not guess patterns from training data.

### Tier 1 — use by default

| Task | Skill | Path |
| --- | --- | --- |
| Supabase (auth, RLS, migrations, storage) | `supabase-expert` | `.agents/skills/supabase-expert/SKILL.md` |
| API calls, fetch, tokens, errors | `native-data-fetching` | `.agents/skills/native-data-fetching/SKILL.md` |
| Third-party integrations (Stripe, Supabase patterns) | `expo-examples` | `.agents/skills/expo-examples/SKILL.md` |
| SDK upgrades, React 19, New Architecture | `upgrading-expo` | `.agents/skills/upgrading-expo/SKILL.md` |

### Tier 2 — UI & media

| Task | Skill | Notes |
| --- | --- | --- |
| Reels, video, blur, animations, storage | `building-native-ui` | Use `references/` (media, animations, visual-effects). **Ignore Expo Router sections** — this app uses React Navigation. |
| Platform-specific web/native splits | `use-dom` | e.g. `*.web.tsx` variants |
| Native iOS/Android UI (sheets, lists, pickers) | `expo-ui` | Only when standard RN components are insufficient |

### Tier 3 — release & ops (when shipping)

| Task | Skill |
| --- | --- |
| App Store / Play Store / TestFlight | `expo-deployment` |
| EAS workflow YAML / CI | `expo-cicd-workflows` |
| Custom native builds beyond Expo Go | `expo-dev-client` |
| OTA update health | `eas-update-insights` |
| Performance monitoring (TTI, cold start) | `expo-observe` |

### Low priority for this project

| Skill | Reason |
| --- | --- |
| `expo-api-routes` | Backend is Cloudflare Workers, not Expo API routes |
| `expo-tailwind-setup` | No Tailwind / NativeWind in this repo |
| `expo-brownfield` | Greenfield Expo app |
| `expo-module` | Only for custom native modules |
| `add-app-clip` | Only if adding iOS App Clips |
| `expo-skill-eval` | Meta-skill for evaluating other skills |

### Gaps (no project skill yet)

- **Cloudflare Workers + R2 + Wrangler** — follow `worker.js`, `wrangler.jsonc`, and `.dev.vars.example`
- **Stripe Connect server flow** — follow `worker-stripe-connect.js` and `src/services/stripeConnectService.ts` (differs from `with-stripe` in expo-examples)
- **KVK verification** — follow `worker-seller-readiness.js` and seller onboarding services

## Conventions

- Match existing patterns in `src/` (services, contexts, screens).
- Schema changes: add numbered SQL files under `supabase/migrations/`.
- Keep RLS strict on all `public` tables; never expose `service_role` in the client.
- Prefer `fetch` over axios (see `native-data-fetching` skill).
- All new features should include unit tests when practical.
- Update changelog on pull requests when the project uses one.

## Learned User Preferences

- Communicate in Dutch when the user writes in Dutch.
- Keep agent guidance and skill config project-scoped (repo `AGENTS.md`, `.agents/skills/`) — not global user config.
- For feed and social UI, target Instagram-like patterns in the Kwaapo theme (dark `#0B0B0B`, pastel blue `#B9D9F7`, bottom sheets like `CommentsSheet`).
- Stay on the stated task; avoid scope drift into unrelated infra (e.g. Supabase CLI linking) unless the user asks.
- Use relevant skills from `.agents/skills/` proactively — manual skill attachment is optional, not required.
- When implementing an attached plan, do not edit the plan file itself.
- Avoid nested React Native `Modal`s for pickers/sheets atop an open modal; use in-modal overlay panels at upload-sheet level (e.g. `UploadProductPickerPanel`, `SpotifySoundPickerPanel` in `ProfileScreen`) — not inside scrollable cards with `overflow: hidden` (e.g. `AudioPickerCard`).

## Learned Workspace Facts

- App display name is **Kwaapo** (`expo.name` in `app.json`); Expo slug remains `lumen-fashion` until identifier migration (see `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md`).
- Supabase production project ref: `mvngamvkdtcprgiizcvk`; linked via `supabase/.temp/project-ref`. (Eerdere sessies linkten per ongeluk naar `xshnwnxvmdtvqcfglfzy` — negeer dat project.)
- Cloudflare Worker `wild-mountain-072a` (`wrangler.jsonc`, `src/constants/cloudVideo.ts`): deploy via `npm run deploy:worker`; pre-deploy check secrets with `npx wrangler secret list` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe, KVK, R2). Client auth: `buildWorkerAuthHeaders()` sends `Authorization: Bearer` only — never `X-App-User-Id`; server identity via `worker-auth.js` → Supabase `/auth/v1/user`. Stale live worker after JWT migration returns `userId required` on uploads — deploy worker with client auth changes.
- KVK (`KVK_API_KEY`, `KVK_API_BASE`) and Spotify (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, optional `SPOTIFY_MARKET`) credentials live on the Cloudflare Worker via `wrangler secret put` or `.dev.vars` for local dev — not in Expo `.env`.
- Feed: `ReelsScreen` + `GlobalFeedContext`; worker `?posts=1` pagination; guests `get_explore_feed`, logged-in `get_personalized_feed`; rolling window trim in `feedRollingWindow.ts` (target 15, max 18) / `shopRollingWindow.ts` (20/24) — never call `prunePostIds` inside a `setState` updater; moderation mutes client-side on global feed (`feedMuteFilter.ts`), server-side in personalized feed only (`0029`/`0032`).
- Reel↔product link: `posts.product_id` (no new migration); upload flow in `ProfileScreen` + `UploadProductPickerPanel`; linkable products = active + stock > 0 (`linkableUploadProducts.ts`, `fetchMyLinkableProducts`); feed card `ProductReelShopCard`; manual checklist `docs/REEL_PRODUCT_LINK_TEST_CHECKLIST.md`.
- `public.follows` (`0031_follows.sql`): `follower_id` / `following_id` → `profiles(id)`; used by FeedItem, ProfileScreen, ActivityScreen; `block_user` unfollows both directions when table exists; `0030` still guards with `to_regclass` for legacy setups.
- If remote DB has schema but empty `schema_migrations`, run `supabase migration repair --status applied` for existing versions before `db push`.
- Install Expo skills with `npx skills@latest add expo/skills` — do not use `--skill '*'` (not treated as a wildcard).
- Phone preview on LAN: `npm run start:phone` or `start-phone.cmd` (sets real LAN IP; avoids `127.0.0.1` QR codes).
- Spotify sounds: `worker-spotify.js` (`?spotifySearch=1`, `?spotifyResolveTrack=1`) upserts `music_tracks` (`0038`: `external_provider`/`external_track_id`); upload in `ProfileScreen` with `AudioPickerCard` + sheet-level `SpotifySoundPickerPanel`; tappable feed badge → `SoundReelsScreen` via `posts.audio_track_id`; client sends `audioTrackId` only (`buildSpotifyWorkerAudioFields`), worker resolves audio from `music_tracks`.
- Spotify Web API (Client Credentials): `market=NL` required on search/track; search `limit` max 10; new developer apps since Nov 2024 return `preview_url: null` — worker enriches previews from Spotify embed page (`audioPreview` in `__NEXT_DATA__`).
