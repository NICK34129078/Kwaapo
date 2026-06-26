# Kwaapo branding & demo content audit

> **Definitieve merknaam: Kwaapo** (niet Lumen).  
> Auditdatum: interne releasevoorbereiding. Technische identifiers (`lumen-fashion`, `com.lumen.fashion`) zijn **bewust niet gewijzigd** in deze pass.

---

## 1. Uitgevoerde zichtbare wijzigingen (niet gecommit)

| Bestand | Was | Nu |
|---------|-----|-----|
| `app.json` → `expo.name` | Lumen | **Kwaapo** |
| `app.json` → iOS/plugin permission strings | “Lumen gebruikt…” | **“Kwaapo gebruikt…”** |
| `src/constants/appPolicies.ts` | Lumen/Kwaapo | **Kwaapo** |
| `src/screens/SellerOnboardingScreen.tsx` | placeholder Lumen Fashion B.V. | **Kwaapo Fashion B.V.** |
| `AGENTS.md` | Kwaapo (Lumen) | **Kwaapo** |
| `docs/APP_STORE_SUBMISSION_CHECKLIST.md` | Lumen/Kwaapo | **Kwaapo** |
| `docs/EAS_RELEASE_CONFIGURATION.md` | Lumen titel + app name | **Kwaapo** |
| `docs/IOS_VISUAL_RELEASE_ASSETS.md` | Lumen inconsistentie sectie | **Kwaapo** vastgesteld |

---

## 2. Overgebleven Lumen / lumen-verwijzingen

| Bestand | Waarde | Type | Actie |
|---------|--------|------|-------|
| `app.json` | `slug`: `lumen-fashion` | Technisch | Identifier-migratie (§4) |
| `app.json` | `scheme`: `lumen-fashion` | Technisch | Identifier-migratie |
| `app.json` | `bundleIdentifier` / `package`: `com.lumen.fashion` | Technisch | Identifier-migratie |
| `package.json` / `package-lock.json` | `name`: `lumen-fashion` | Technisch npm | Optioneel hernoemen naar `kwaapo` |
| `App.tsx` | prefix `lumen-fashion://` | Technisch deep link | Sync met scheme-migratie |
| `src/constants/shareLinks.ts` | `APP_SCHEME = "lumen-fashion"` | Technisch | Sync met scheme-migratie |
| `worker.js` | checkout/post deep link defaults | Technisch server | Sync + wrangler env |
| `worker-stripe.js` | checkout cancel/success defaults | Technisch server | Sync + wrangler env |
| `.dev.vars.example` | comments `lumen-fashion://` | Documentatie | Update na scheme-migratie |
| `docs/EAS_RELEASE_CONFIGURATION.md` | slug/scheme/bundle refs | Documentatie | Update na migratie |
| `docs/PRE_DEPLOY_GO_NO_GO.md` | `com.lumen.fashion` checklist | Documentatie | Update na migratie |
| `docs/IOS_VISUAL_RELEASE_ASSETS.md` | bundle ID sectie | Documentatie | Update na migratie |

**Geen Lumen meer in user-facing app copy** na branding commit.

---

## 3. Volledige audit — per gevonden item

Legenda kolommen:
- **Zichtbaarheid:** User = eindgebruiker | Tester = TestFlight | Dev = alleen ontwikkelaars
- **TestFlight:** moet vóór interne TestFlight?
- **App Store:** moet vóór submission?
- **Technisch:** voorzichtig wijzigen (breaking)?

### 3.1 Merknaam & app-config

| # | Pad | Huidige waarde | Zichtbaar | TestFlight | App Store | Technisch | Aanbevolen Kwaapo |
|---|-----|----------------|-----------|------------|-----------|-----------|-------------------|
| B1 | `app.json` → `expo.name` | **Kwaapo** | User (home screen) | — | — | Nee | ✅ Afgerond |
| B2 | `app.json` → permission strings | **Kwaapo gebruikt…** | User (iOS prompts) | — | — | Nee | ✅ Afgerond |
| B3 | `app.json` → `slug` | `lumen-fashion` | Dev/EAS | Nee* | Nee* | **Ja** | `kwaapo` (§4) |
| B4 | `app.json` → `scheme` | `lumen-fashion` | User (deep links) | Optioneel | Optioneel | **Ja** | `kwaapo` (§4) |
| B5 | `app.json` → `ios.bundleIdentifier` | `com.lumen.fashion` | Dev/ASC | **Ja** | **Ja** | **Ja** | `com.kwaapo.app` (§4) |
| B6 | `app.json` → `android.package` | `com.lumen.fashion` | Dev/Play | Later | Later | **Ja** | `com.kwaapo.app` (§4) |
| B7 | `package.json` → `name` | `lumen-fashion` | Dev | Nee | Nee | Laag | `kwaapo` (cosmetisch) |

\*Slug is niet zichtbaar voor users maar wel in Expo URLs tijdens dev.

### 3.2 UI, policies & marketplace

| # | Pad | Huidige waarde | Zichtbaar | TestFlight | App Store | Technisch | Aanbevolen |
|---|-----|----------------|-----------|------------|-----------|-----------|------------|
| B8 | `src/constants/shareLinks.ts` → `SHARE_BRAND_NAME` | Kwaapo | User (share tekst) | — | — | Nee | ✅ OK |
| B9 | `src/constants/shareLinks.ts` → `APP_SCHEME` | `lumen-fashion` | Dev | — | — | **Ja** | `kwaapo` (§4) |
| B10 | `src/screens/ShopScreen.tsx` | “Kwaapo Store” | User | — | — | Nee | ✅ OK |
| B11 | `src/screens/ProfileScreen.tsx` | mail subject “Kwaapo support” | User | — | — | Nee | ✅ OK |
| B12 | `src/constants/appPolicies.ts` | “Kwaapo is…” / “Door Kwaapo…” | User | — | **Ja** | Nee | ✅ Afgerond |
| B13 | `src/screens/SellerOnboardingScreen.tsx` | placeholder Kwaapo Fashion B.V. | User | — | — | Nee | ✅ Afgerond |
| B14 | `src/services/stripeConnectService.ts` | comment “geen IBAN in Kwaapo” | Dev | Nee | Nee | Nee | ✅ OK |
| B15 | `src/services/sellerOnboardingService.ts` | “Kwaapo slaat geen bankgegevens op” | User | — | — | Nee | ✅ OK |
| B16 | `src/services/savedProductsService.ts` | `kwaapo_saved_product_ids` | Dev (AsyncStorage key) | Nee | Nee | Migratie data | Behouden of `kwaapo_*` OK |

### 3.3 Deep links & worker

| # | Pad | Huidige waarde | Zichtbaar | TestFlight | App Store | Technisch | Aanbevolen |
|---|-----|----------------|-----------|------------|-----------|-----------|------------|
| B17 | `App.tsx` linking prefixes | `lumen-fashion://` | User (redirects) | Optioneel | Optioneel | **Ja** | `kwaapo://` |
| B18 | `worker.js` | `lumen-fashion://post/`, checkout defaults | User | Optioneel | Optioneel | **Ja** | `kwaapo://` + env |
| B19 | `worker-stripe.js` | checkout success/cancel defaults | User | Optioneel | Optioneel | **Ja** | `kwaapo://` + env |
| B20 | `worker-stripe-connect.js` | comment Kwaapo | Dev | Nee | Nee | Nee | ✅ OK |
| B21 | `src/services/stripeCheckoutService.ts` | Worker HTTPS returns (primair) | User | — | — | Nee | ✅ OK (HTTPS) |

### 3.4 Demo / placeholder content

| # | Pad | Huidige waarde | Zichtbaar | TestFlight | App Store | Technisch | Aanbeveling |
|---|-----|----------------|-----------|------------|-----------|-----------|-------------|
| D1 | `src/data/placeholder.ts` → `REELS_POSTS` | 8 Unsplash demo reels | User** | **Ja** | **Ja** | Nee | Verwijderen of vervangen door lege state (§5) |
| D2 | `src/data/placeholder.ts` → `REEL_VIDEO_POSTER_FALLBACK` | Unsplash URL | User | Optioneel | Optioneel | Nee | Eigen Kwaapo fallback of solid color |
| D3 | `src/constants/cloudVideo.ts` → `UPLOADED_VIDEO_OWNER` | `@mara.veldt` | Dev/legacy | Nee | Nee | Laag | Verwijderen; gebruik auth user |
| D4 | `assets/default-avatar.png` | 640×640 PNG | User (geen avatar) | Optioneel | Optioneel | Nee | Vervangen door Kwaapo default avatar |
| D5 | `assets/seller-mascot.png` | 640×640 PNG | User (seller UI) | — | — | Nee | Behouden of Kwaapo mascot redesign |
| D6 | `src/context/LikesContext.tsx` | `demoOverrides` voor `reel-*` ids | User (demo reels) | **Ja** | **Ja** | Nee | Opruimen met REELS_POSTS |
| D7 | `src/services/postLikesService.ts` | comment placeholders `reel-1` | Dev | Nee | Nee | Nee | OK na demo cleanup |
| D8 | `src/screens/PlaceholderScreen.tsx` | generiek placeholder scherm | User (indien gebruikt) | Check routes | Check routes | Nee | Hernoemen indien nodig |

** D1: `REELS_POSTS` wordt momenteel **niet geïmporteerd** door schermen (feed komt van worker/Supabase). Dead code maar risico bij toekomstig gebruik.

### 3.5 Documentatie & submission

| # | Pad | Huidige waarde | Zichtbaar | TestFlight | App Store | Technisch | Aanbeveling |
|---|-----|----------------|-----------|------------|-----------|-----------|-------------|
| DOC1 | `docs/APP_STORE_SUBMISSION_CHECKLIST.md` | Kwaapo | Dev | — | **Ja** | Nee | ✅ Bijgewerkt |
| DOC2 | `docs/APP_STORE_SUBMISSION_CHECKLIST.md` | DEMO ACCOUNTS `[INVULLEN]` | ASC reviewer | — | **Ja** | Nee | Invullen vóór submission |
| DOC3 | `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md` | Kwaapo | Dev | — | — | Nee | ✅ OK |
| DOC4 | `AGENTS.md` | Kwaapo | Dev | Nee | Nee | Nee | ✅ Bijgewerkt |

### 3.6 Nog in te vullen (geen merk, wel blocker)

| # | Pad | Waarde | TestFlight | App Store |
|---|-----|--------|------------|-----------|
| P1 | `src/constants/appPolicies.ts` | `SUPPORT_EMAIL` = `[INVULLEN]` | **Ja** | **Ja** |
| P2 | `src/constants/appPolicies.ts` | `PRIVACY_POLICY_WEB_URL` = `[INVULLEN]` | **Ja** | **Ja** |
| P3 | `assets/icon.png` | ontbreekt | **Ja** | **Ja** |
| P4 | `assets/splash.png` | ontbreekt | Aanbevolen | Aanbevolen |

---

## 4. Technische identifier-migratie — voorstel

> **Aanbeveling:** omdat de app **nog niet publiek live** is, is **vóór eerste TestFlight** het beste moment om identifiers naar Kwaapo te migreren — mits je nog geen App Store Connect app record hebt geregistreerd onder `com.lumen.fashion`.

### 4.1 Per identifier

| Identifier | Huidige waarde | Aanbevolen Kwaapo-waarde | Impact | Risico | Handmatig extern | Veilig vóór 1e TestFlight? | Behouden? |
|------------|----------------|--------------------------|--------|--------|------------------|----------------------------|-----------|
| iOS Bundle ID | `com.lumen.fashion` | `com.kwaapo.app` | Nieuwe ASC app, certs, provisioning | Laag als **nog geen ASC record** | Apple Developer: nieuw App ID | **Ja — preferred** | Nee — migreer |
| Android package | `com.lumen.fashion` | `com.kwaapo.app` | Play Console app (later) | Laag pre-release | Play Console | Ja | Nee — migreer |
| Expo slug | `lumen-fashion` | `kwaapo` | EAS project URL, updates channel | Laag vóór `eas init` | `eas init` na wijziging | **Ja — preferred** | Nee — migreer |
| URL scheme | `lumen-fashion` | `kwaapo` | Deep links, checkout return, share | **Medium** — alle clients + worker + Supabase | Supabase Auth redirect URLs; Stripe return URLs indien custom scheme | Ja, in één release window | Nee — migreer |
| npm package name | `lumen-fashion` | `kwaapo` | CLI/scripts only | Zeer laag | Geen | Ja | Optioneel |
| AsyncStorage keys | `kwaapo_saved_product_ids` | al Kwaapo | Geen | Geen | Nee | Ja | ✅ Behouden |
| Worker name | `wild-mountain-072a` | geen rename nodig | URL blijft | Geen | Cloudflare | Ja | ✅ Behouden |
| Expo project ID | (ontbreekt) | na `eas init` | EAS builds | Geen | Expo dashboard | Maak **na** slug/bundle besluit | — |
| Stripe metadata | geen Lumen in code | geen wijziging | — | — | Stripe Dashboard product names optioneel | Ja | — |
| Supabase redirect URLs | `lumen-fashion://**` | `kwaapo://**` (+ exp scheme) | OAuth/magic links | Medium | Supabase Dashboard | Sync met scheme migratie | Migreer met scheme |

### 4.2 Aanbevolen volgorde (aparte migratie-commit)

1. Besluit bundle ID (`com.kwaapo.app` vs `com.kwaapo.fashion`) — **`com.kwaapo.app` korter/standaard**.
2. Wijzig `app.json`: slug, scheme, bundleIdentifier, package.
3. Wijzig `App.tsx`, `shareLinks.ts`, `worker.js`, `worker-stripe.js`, `.dev.vars.example`.
4. Update Supabase Auth redirect URLs in dashboard.
5. **Daarna pas** `eas init` + Apple App ID aanmaken onder nieuwe bundle.
6. Worker redeploy + nieuwe app build in hetzelfde venster.

### 4.3 Wanneer **niet** migreren

- Als App Store Connect al een app heeft onder `com.lumen.fashion` met TestFlight builds → **behouden**; alleen consumer name = Kwaapo.
- Als externe testers deep links/bookmarks hebben met `lumen-fashion://` → plan communicatie of behoud scheme.

---

## 5. Demo / placeholder cleanup-plan

| Fase | Actie | Wanneer | Breaking? |
|------|-------|---------|-----------|
| **5.1** | Verwijder of deprecate `REELS_POSTS` / `PROFILE_POSTS` dead code | Vóór TestFlight | Nee (niet gebruikt) |
| **5.2** | Vervang `UPLOADED_VIDEO_OWNER` fallback door auth profile username | Vóór TestFlight | Nee |
| **5.3** | Vervang `REEL_VIDEO_POSTER_FALLBACK` Unsplash door Kwaapo asset of neutrale kleur | TestFlight polish | Nee |
| **5.4** | Design `default-avatar.png` in Kwaapo stijl | TestFlight | Nee |
| **5.5** | Review `demoOverrides` in `LikesContext` — verwijder demo reel id pad | Na 5.1 | Nee |
| **5.6** | E2E testdata: echte buyer/seller accounts, geen `@mara.veldt` | Pre-deploy | Nee |

**Niet doen zonder expliciet akkoord:** demo content verwijderen uit productie-feed logic (feed is al live via worker).

---

## 6. Voorgestelde commits

### Al gecommit

```
aa33ecf docs: add iOS visual release assets audit
```

### Voorgesteld — branding (deze wijzigingen)

```
chore(branding): standardize consumer-facing name to Kwaapo
```

**Bestanden in branding commit:**

- `app.json` (alleen `name` + permission strings — **niet** slug/scheme/bundle)
- `src/constants/appPolicies.ts`
- `src/screens/SellerOnboardingScreen.tsx`
- `AGENTS.md`
- `docs/APP_STORE_SUBMISSION_CHECKLIST.md`
- `docs/EAS_RELEASE_CONFIGURATION.md`
- `docs/IOS_VISUAL_RELEASE_ASSETS.md`
- `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md` (dit document)

### Later — identifier migratie (aparte commit)

```
chore(identifiers): migrate Expo slug, scheme and bundle ID to Kwaapo
```

---

## 7. Samenvatting

| Categorie | Status |
|-----------|--------|
| Zichtbare merknaam Kwaapo | ✅ Bijna af — commit branding |
| Technische `lumen-*` identifiers | ⏳ Voorstel §4 — **niet gewijzigd** |
| Demo Unsplash / @mara.veldt | ⏳ Cleanup-plan §5 — **niet verwijderd** |
| App icon / splash | ❌ Blocker |
| SUPPORT_EMAIL / privacy URL | ❌ Blocker |
