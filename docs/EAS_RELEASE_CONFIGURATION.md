# EAS release configuration — Lumen (iOS)

> Alleen interne releasevoorbereiding. Geen App Store submission in deze fase.

## EAS-profielen (`eas.json`)

| Profiel | Doel | Distribution | Dev client | Submit |
|---------|------|--------------|------------|--------|
| `development` | Lokale/dev-client builds (optioneel) | `internal` | **Ja** | Nee |
| `preview` | Interne TestFlight / pre-release test | `store` (upload naar App Store Connect) | Nee | Alleen handmatig, niet automatisch |
| `production` | Uiteindelijke App Store-build | `store` | Nee | Configureer later; **nog niet submitten** |

`appVersionSource: remote` — iOS build numbers worden centraal op EAS beheerd (zie [Build numbers](#build-numbers-veilig-verhogen)).

---

## Eerste setup (eenmalig, handmatig)

```bash
# 1. Expo/EAS account + project koppelen (voegt extra.eas.projectId toe aan app.json)
npx eas-cli@latest login
npx eas-cli@latest init

# 2. Apple credentials (EAS beheert certificaten/profiles)
npx eas-cli@latest credentials

# 3. Environment variables per EAS environment (geen secrets in git)
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --environment development --visibility plaintext
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --environment development --visibility sensitive

# Herhaal voor preview en production (zelfde productie-Supabase als je één backend gebruikt)
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --environment preview --visibility plaintext
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --environment preview --visibility sensitive
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_PROJECT.supabase.co" --environment production --visibility plaintext
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --environment production --visibility sensitive

# Optioneel: eigen share-domein (default = Worker-URL in code)
npx eas-cli@latest env:create --scope project --name EXPO_PUBLIC_SHARE_BASE_URL --value "https://jouwdomein.nl" --environment production --visibility plaintext
```

**Development profile vereist `expo-dev-client`** (nog niet geïnstalleerd):

```bash
npx expo install expo-dev-client
```

---

## Environment variables per profiel

| Variable | development | preview | production | Waar gezet |
|----------|-------------|---------|------------|------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Vereist | Vereist | Vereist | EAS env (niet in repo) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Vereist | Vereist | Vereist | EAS env (sensitive) |
| `EXPO_PUBLIC_SHARE_BASE_URL` | Optioneel | Optioneel | Optioneel | EAS env |

Lokaal (Expo Go / `expo start`): `.env` in projectroot (gitignored), zie `.env.example`.

**Niet in de app / EAS app env:**

| Secret | Alleen op |
|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Worker (`wrangler secret put`) |
| `STRIPE_SECRET_KEY` | Cloudflare Worker |
| `STRIPE_WEBHOOK_SECRET` | Cloudflare Worker |
| `KVK_API_KEY` | Cloudflare Worker |
| R2 credentials | Cloudflare binding |

Stripe heeft **geen** secret keys in de app-bundle. Checkout loopt via de Worker.

---

## Huidige Expo-config (`app.json`) — controle

| Item | Waarde | Status |
|------|--------|--------|
| App name | `Lumen` | OK |
| Slug | `lumen-fashion` | OK |
| Version | `1.0.0` | OK — marketing version |
| iOS buildNumber | `1` (startwaarde; EAS remote overschrijft bij build) | OK |
| Bundle ID | `com.lumen.fashion` | **Bevestig in Apple Developer / ASC** |
| Deep link scheme | `lumen-fashion` | OK |
| Permission strings | Camera, photo library, microphone | OK |
| Splash | Alleen `backgroundColor: #0B0B0B` | Geen splash-image |
| App icon | **Ontbreekt** | **Blocker vóór EAS build** — voeg `assets/icon.png` (1024×1024) toe + `"icon"` in `app.json` |
| Expo project ID | **Ontbreekt** | `eas init` vult `expo.extra.eas.projectId` |
| New Architecture | `true` | OK |

---

## Redirect / deep link URLs

### App scheme (Expo)

- Scheme: `lumen-fashion://`
- Checkout deep links: `lumen-fashion://checkout/success`, `lumen-fashion://checkout/cancel`
- Shared posts: `lumen-fashion://post/<id>`

### Stripe checkout (primair HTTPS via Worker)

Hardcoded in `src/constants/cloudVideo.ts`:

```
https://wild-mountain-072a.n-vandullemen.workers.dev?checkoutReturn=1&session_id={CHECKOUT_SESSION_ID}
https://wild-mountain-072a.n-vandullemen.workers.dev?checkoutCancel=1
```

Stripe Connect return: `?stripeConnectReturn=1` op dezelfde Worker-URL.

**Geen aparte preview-worker in code** — alle profielen praten tegen dezelfde Worker-URL tot je een staging-worker introduceert.

### Supabase Auth (Dashboard → Authentication → URL Configuration)

Voeg toe (pas aan na `eas init` indien Expo-generated scheme):

```
lumen-fashion://**
exp+lumen-fashion://**
```

Site URL (dev): `exp://127.0.0.1:8081` of je dev-client URL.

`detectSessionInUrl: false` in de app — magic links/OAuth moeten compatibel zijn met jullie auth-flow.

---

## Build commands

### Interne iOS-test (TestFlight-ready, profiel `preview`)

```bash
npx eas-cli@latest build --profile preview --platform ios
```

Upload naar TestFlight (handmatig, na build):

```bash
npx eas-cli@latest submit --profile preview --platform ios --latest
```

### Productie-build (nog niet submitten naar review)

```bash
npx eas-cli@latest build --profile production --platform ios
```

**Niet uitvoeren tot go/no-go checklist af is** (`docs/PRE_DEPLOY_GO_NO_GO.md`).

### Development dev-client (optioneel)

```bash
npx expo install expo-dev-client   # eenmalig
npx eas-cli@latest build --profile development --platform ios
```

---

## Build numbers veilig verhogen

Met `"appVersionSource": "remote"`:

```bash
# Huidige remote versie bekijken
npx eas-cli@latest build:version:get --platform ios

# Handmatig zetten (indien nodig)
npx eas-cli@latest build:version:set --platform ios --build-number 2

# production profiel: autoIncrement: true verhoogt build number automatisch per production build
```

**Marketing version** (`1.0.0`): wijzig `expo.version` in `app.json` bij user-facing releases.

Regel: **nooit** een build number hergebruiken dat al naar App Store Connect is geüpload.

---

## Wat jij nog moet invullen

| Item | Waar |
|------|------|
| `eas init` + `extra.eas.projectId` | `app.json` (via CLI) |
| App icon 1024×1024 | `assets/icon.png` + `"icon"` in `app.json` |
| Apple Team ID / ASC app record | Apple Developer + `eas credentials` |
| `EXPO_PUBLIC_SUPABASE_*` per EAS environment | `eas env:create` |
| `SUPPORT_EMAIL` | `src/constants/appPolicies.ts` |
| `PRIVACY_POLICY_WEB_URL` | `src/constants/appPolicies.ts` + live webpagina |
| Supabase redirect URLs | Supabase Dashboard |
| Worker secrets | `wrangler secret put` (zie `.dev.vars.example`) |
| Stripe test vs live | Worker secrets + Stripe Dashboard (zie `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md`) |
| Bundle ID geregistreerd | Apple Developer (`com.lumen.fashion`) |

---

## Veiligheid — geen test/dev in production

- [x] Geen Stripe secret keys in app of `eas.json`
- [x] Geen service role key in app
- [x] `.env` gitignored; `.env.example` alleen placeholders
- [x] EAS env vars via dashboard/CLI, niet gecommit
- [ ] Bevestig Stripe **test** keys op Worker tot live go-live
- [ ] Bevestig Supabase project URL is het beoogde productieproject (anon key is publiek by design)

---

## Gerelateerde docs

- `docs/PRE_DEPLOY_GO_NO_GO.md`
- `docs/JWT_BREAKING_CHANGE_RELEASE_PLAN.md`
- `docs/APP_STORE_SUBMISSION_CHECKLIST.md`
