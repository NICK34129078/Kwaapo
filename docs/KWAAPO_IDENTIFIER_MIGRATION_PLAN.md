# Kwaapo identifier migration plan

> **Status: PLAN ONLY — niet uitgevoerd.**  
> Uitvoeren **alleen** als go/no-go (§8) = **nee** op bestaande `com.lumen.fashion` registratie.

**Doel:** vóór eerste TestFlight-build en vóór `eas init` migreren van Lumen-technische identifiers naar Kwaapo.

| Identifier | Huidig | Nieuw |
|------------|--------|-------|
| iOS bundle ID | `com.lumen.fashion` | `com.kwaapo.app` |
| Android package | `com.lumen.fashion` | `com.kwaapo.app` |
| Expo slug | `lumen-fashion` | `kwaapo` |
| Deep link scheme | `lumen-fashion` | `kwaapo` |
| npm package name | `lumen-fashion` | `kwaapo` |

**Niet wijzigen in deze migratie:** Worker hostname (`wild-mountain-072a…`), Supabase project URL, Stripe account, `expo.name` (= **Kwaapo**, al afgerond).

---

## 1. Huidige identifiers — exacte locaties

### 1.1 `com.lumen.fashion` (bundle / package)

| Bestand | Veld / context |
|---------|----------------|
| `app.json` | `expo.ios.bundleIdentifier` |
| `app.json` | `expo.android.package` |
| `docs/EAS_RELEASE_CONFIGURATION.md` | documentatie |
| `docs/IOS_VISUAL_RELEASE_ASSETS.md` | documentatie |
| `docs/PRE_DEPLOY_GO_NO_GO.md` | checklist |
| `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md` | audit |

### 1.2 `lumen-fashion` (Expo slug)

| Bestand | Veld / context |
|---------|----------------|
| `app.json` | `expo.slug` |
| `docs/EAS_RELEASE_CONFIGURATION.md` | documentatie |
| `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md` | audit |

### 1.3 `lumen-fashion` (URL scheme / deep links)

| Bestand | Veld / context |
|---------|----------------|
| `app.json` | `expo.scheme` |
| `App.tsx` | `linking.prefixes` — `"lumen-fashion://"` |
| `src/constants/shareLinks.ts` | `APP_SCHEME` |
| `worker.js` | comment defaults; `lumen-fashion://post/${postId}` |
| `worker-stripe.js` | default `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` fallbacks |
| `.dev.vars.example` | comment + optional env examples |
| `docs/EAS_RELEASE_CONFIGURATION.md` | Supabase redirect voorbeelden |

### 1.4 `lumen-fashion` (npm package name)

| Bestand | Veld / context |
|---------|----------------|
| `package.json` | `"name"` |
| `package-lock.json` | `"name"` (root + packages) |

### 1.5 Gerelateerd (geen rename, wel sync)

| Service | Huidige waarde | Actie bij migratie |
|---------|----------------|-------------------|
| Supabase Auth | redirect URLs met `lumen-fashion://**` | Dashboard → `kwaapo://**` |
| Expo dev client | `exp+lumen-fashion://` | Dashboard → `exp+kwaapo://` |
| Cloudflare Worker | optionele `CHECKOUT_*_URL` secrets | Alleen als custom scheme env gezet |
| Stripe Checkout | primair **HTTPS worker URLs** | Geen Stripe-wijziging tenzij custom scheme in Dashboard |

---

## 2. Exacte Kwaapo-vervanging (code)

| Huidig | Nieuw | Bestanden |
|--------|-------|-----------|
| `com.lumen.fashion` | `com.kwaapo.app` | `app.json` (ios + android) |
| `lumen-fashion` (slug) | `kwaapo` | `app.json` |
| `lumen-fashion` (scheme) | `kwaapo` | `app.json`, `App.tsx`, `shareLinks.ts`, `worker.js`, `worker-stripe.js`, `.dev.vars.example` |
| `lumen-fashion` (npm) | `kwaapo` | `package.json`, `package-lock.json` (regenerate via `npm install`) |
| `exp+lumen-fashion://` | `exp+kwaapo://` | Supabase Dashboard (handmatig) |
| docs refs | `com.kwaapo.app`, `kwaapo` | `EAS_RELEASE_CONFIGURATION.md`, `IOS_VISUAL_RELEASE_ASSETS.md`, `PRE_DEPLOY_GO_NO_GO.md`, `BRANDING_AND_DEMO_CONTENT_AUDIT.md`, `AGENTS.md` |

---

## 3. Wijzigingen alleen in code (geautomatiseerde commit)

Uit te voeren in **één geïsoleerde commit** na go/no-go = nee:

```
chore(identifiers): migrate Expo slug, scheme and bundle ID to Kwaapo
```

### Stap A — `app.json`

```json
"slug": "kwaapo",
"scheme": "kwaapo",
"ios": { "bundleIdentifier": "com.kwaapo.app", ... },
"android": { "package": "com.kwaapo.app", ... }
```

### Stap B — App deep linking

- `App.tsx`: `"kwaapo://"` in `linking.prefixes`
- `src/constants/shareLinks.ts`: `APP_SCHEME = "kwaapo"` + comment

### Stap C — Worker defaults

- `worker.js`: checkout comment defaults + `kwaapo://post/`
- `worker-stripe.js`: alle `lumen-fashion://checkout/...` fallbacks → `kwaapo://checkout/...`

### Stap D — npm

```bash
# In package.json: "name": "kwaapo"
npm install   # regenereert package-lock.json
```

### Stap E — Documentatie

Update alle docs uit §1.

### Stap F — **Niet** in code-commit

- Geen `eas init` in dezelfde commit
- Geen worker deploy tot testplan klaar

---

## 4. Handmatige stappen (jij)

### 4.1 Apple Developer

1. **Identifiers → App IDs → Register** nieuwe App ID: `com.kwaapo.app`
2. Capabilities: zelfde als gepland (Push later indien nodig, Associated Domains indien later)
3. **Niet** verwijderen `com.lumen.fashion` tot bevestigd ongebruikt
4. Certificates/Profiles: EAS regelt meestal via `eas credentials` **na** `eas init` met nieuwe bundle

### 4.2 App Store Connect

1. **Apps → + → New App**
2. Bundle ID: **`com.kwaapo.app`** (niet `com.lumen.fashion`)
3. Name: **Kwaapo**
4. SKU: bijv. `kwaapo-ios-001`
5. Als er **al** een app onder `com.lumen.fashion` bestaat → **STOP** (§8)

### 4.3 Expo / EAS

1. **Eerst** code-migratie mergen
2. `npx eas-cli@latest login`
3. `npx eas-cli@latest init` — kiest slug `kwaapo` uit `app.json`
4. `npx eas-cli@latest env:create` voor `EXPO_PUBLIC_SUPABASE_*` (development / preview / production)
5. `npx eas-cli@latest credentials` — koppelt aan `com.kwaapo.app`
6. EAS Update channels in `eas.json` (`preview`, `production`) blijven geldig

### 4.4 Supabase Auth (Dashboard → Authentication → URL Configuration)

**Site URL** (dev): bijv. `exp://127.0.0.1:8081` of leeg voor native-only.

**Redirect URLs** — voeg toe (behoud oude tijdelijk tijdens test indien nodig):

```
kwaapo://**
exp+kwaapo://**
kwaapo://checkout/success
kwaapo://checkout/cancel
kwaapo://post/*
```

Verwijder `lumen-fashion://**` pas na succesvolle E2E deep link test.

### 4.5 Stripe

**Checkout (primair):** app gebruikt **HTTPS worker URLs** — geen Stripe Dashboard-wijziging vereist voor checkout return.

**Optioneel / indien custom scheme env op worker:**

- Worker secrets `CHECKOUT_SUCCESS_URL` / `CHECKOUT_CANCEL_URL` → `kwaapo://checkout/...`
- Stripe Connect return blijft worker HTTPS (`?stripeConnectReturn=1`)

**Metadata:** geen verplichte rename; optioneel business name “Kwaapo” in Stripe Dashboard.

### 4.6 Cloudflare Worker

1. Code defaults wijzigen (§3)
2. **Deploy worker** in hetzelfde venster als nieuwe app-build (JWT breaking change al live)
3. Optionele wrangler secrets updaten:

```bash
npx wrangler secret put CHECKOUT_SUCCESS_URL
# kwaapo://checkout/success?session_id={CHECKOUT_SESSION_ID}

npx wrangler secret put CHECKOUT_CANCEL_URL
# kwaapo://checkout/cancel
```

Alleen nodig als je secrets expliciet hebt gezet; anders volgen defaults uit code.

### 4.7 Android / Google Play (later)

1. Play Console → Create app
2. Package: `com.kwaapo.app`
3. EAS `production` / `preview` Android build pas wanneer Play listing klaar is

---

## 5. Deep links & flows — test na migratie

| # | Flow | URL / actie | Verwacht |
|---|------|-------------|----------|
| T1 | Share post | `kwaapo://post/<uuid>` | Opent SharedPost in app |
| T2 | Checkout success | Worker HTTPS → app `kwaapo://checkout/success?session_id=…` | Order bevestigd |
| T3 | Checkout cancel | Worker HTTPS → `kwaapo://checkout/cancel` | Terug naar app, stock released |
| T4 | Stripe Connect return | Worker `?stripeConnectReturn=1` | Seller onboarding voortzet |
| T5 | Supabase magic link / OAuth | e-mail link met `kwaapo://` | Session in app |
| T6 | Expo dev client | `exp+kwaapo://` | Dev login redirect |
| T7 | Public share page | Worker `/post/<id>` → “Open in app” deep link | `kwaapo://post/...` |

Test op **fysiek device** met nieuwe TestFlight/internal build — simulator is onvoldoende voor universal links/scheme.

---

## 6. Rollback vóór eerste TestFlight

> Rollback is eenvoudig **zolang er nog geen TestFlight-build onder `com.kwaapo.app` is geüpload**.

| Situatie | Actie |
|----------|-------|
| Code gemigreerd, nog geen `eas init` | Git revert identifier commit; `app.json` terug naar `com.lumen.fashion` |
| `eas init` gedaan, geen build | Revert code; optioneel Expo project verwijderen in dashboard |
| Apple App ID `com.kwaapo.app` aangemaakt | Kan blijven staan (harmless); gebruik `com.lumen.fashion` via revert |
| Worker deployed met `kwaapo://` | `wrangler rollback` + revert app code |
| Supabase redirects gewijzigd | Herstel `lumen-fashion://**` in dashboard |

**Geen data-migratie** in Supabase nodig — identifiers zijn client/platform only.

---

## 7. Aanbevolen uitvoeringsvolgorde

```
Go/no-go (§8) = NEE op bestaande com.lumen.fashion ASC/build
    ↓
1. Git: identifier migration commit (§3)
    ↓
2. Supabase: redirect URLs toevoegen (kwaapo + exp+kwaapo)
    ↓
3. Apple Developer: register com.kwaapo.app
    ↓
4. eas init + env vars + credentials
    ↓
5. App Store Connect: nieuwe app Kwaapo / com.kwaapo.app
    ↓
6. Worker deploy (kwaapo:// defaults)
    ↓
7. eas build --profile preview --platform ios
    ↓
8. E2E deep link + checkout test (§5)
    ↓
9. Verwijder oude lumen-fashion redirects uit Supabase (optioneel)
```

**Niet doen:** `eas init` vóór code-migratie — anders koppelt EAS aan verkeerde slug/bundle.

---

## 8. Go / no-go (VERPLICHT vóór start)

Beantwoord **ja of nee**:

> **Bestaat er al een App Store Connect-app, Apple Developer bundle-registratie (`com.lumen.fashion`), provisioning profile, of TestFlight-build onder `com.lumen.fashion`?**

| Antwoord | Besluit |
|----------|---------|
| **Ja** | **Geen** identifier-migratie zonder nieuw besluit. Behoud `com.lumen.fashion`; alleen merknaam Kwaapo in UI. |
| **Nee** | Voer §3–7 uit **vóór** `eas init` en eerste TestFlight-build. |

### Waar controleren

1. [Apple Developer](https://developer.apple.com/account/resources/identifiers/list) → Identifiers → zoek `com.lumen.fashion`
2. [App Store Connect](https://appstoreconnect.apple.com/apps) → Apps → bundle ID kolom
3. TestFlight → builds gekoppeld aan app
4. Lokaal: `eas credentials` / `eas project:info` — alleen relevant **na** eerdere `eas init`

---

## 9. Gerelateerde docs

- `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md` — merknaam audit
- `docs/DEMO_PLACEHOLDER_CLEANUP_PLAN.md` — demo content (apart plan)
- `docs/EAS_RELEASE_CONFIGURATION.md` — build profielen
- `docs/JWT_BREAKING_CHANGE_RELEASE_PLAN.md` — worker + app deploy venster
