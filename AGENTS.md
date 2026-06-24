# AGENTS.md — Kwaapo (Lumen)

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
