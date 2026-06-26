# iOS visual release assets — audit

> Auditdatum: interne releasevoorbereiding. Geen placeholder app-icon of tijdelijke release-branding aangemaakt.

---

## Samenvatting audit

| Onderdeel | Status |
|-----------|--------|
| App icon (EAS / App Store) | **Ontbreekt** — blocker |
| Splash / launch visual | Alleen kleur `#0B0B0B` — **geen image** |
| App name “Lumen” | Grotendeels consistent in iOS-config; **“Kwaapo” nog in UI/share** |
| Bundle ID `com.lumen.fashion` | Consistent in `app.json`; geen andere bundle IDs in repo |
| In-app placeholder branding | Unsplash reels, default avatar, seller mascot, share brand “Kwaapo” |
| App Store screenshots | **Nog niet aanwezig** — later handmatig |

---

## 1. App icon — ontbreekt

### Huidige situatie

- Geen `"icon"` veld in `app.json`.
- Geen `assets/icon.png` (of vergelijkbaar) in de repository.
- **EAS iOS build faalt** of gebruikt een generieke fallback zonder merk — niet geschikt voor TestFlight/App Store.

### Wat jij aanlevert

| Bestand | Afmeting | Formaat | Opmerkingen |
|---------|----------|---------|-------------|
| `assets/icon.png` | **1024 × 1024 px** | PNG | Master voor iOS App Store; **geen transparantie** (Apple-eis) |
| Optioneel: `assets/icon-ios.png` | 1024 × 1024 | PNG | Alleen nodig als iOS/Android visueel verschillen |

### Wat Cursor kan koppelen (zodra jij het bestand hebt)

In `app.json`:

```json
"icon": "./assets/icon.png"
```

Expo genereert automatisch de benodigde iOS icon sizes tijdens prebuild/EAS.

### Niet verwarren met

| Bestand | Doel | Formaat |
|---------|------|---------|
| `assets/default-avatar.png` | In-app profiel-fallback (640×640) | **Geen app icon** |
| `assets/seller-mascot.png` | Seller fulfillment UI mascot (640×640) | **Geen app icon** |

---

## 2. Splash / launch screen

### Huidige situatie

```json
"splash": {
  "backgroundColor": "#0B0B0B"
}
```

- Geen `"image"`, geen `"resizeMode"`.
- Launch screen = leeg donker scherm tot JS laadt — functioneel maar niet merkbaar.

### Aanbevolen assets (jij aanleveren)

| Bestand | Afmeting | Formaat | Gebruik |
|---------|----------|---------|---------|
| `assets/splash.png` | **1284 × 2778 px** (portrait) | PNG | Universal splash source (Expo schaalt) |
| Alternatief | **2732 × 2732 px** | PNG | Vierkant logo gecentreerd op `#0B0B0B` |

Veilige marge: logo/woordmerk binnen **centrale 40–50%** — geen tekst tot aan de rand (notch/home indicator).

### `app.json` velden (Cursor koppelt later)

```json
"splash": {
  "image": "./assets/splash.png",
  "resizeMode": "contain",
  "backgroundColor": "#0B0B0B"
}
```

Optioneel voor fijnere controle: `expo-splash-screen` plugin in `app.json` plugins (native splash sync).

---

## 3. App name “Lumen” — consistentie

| Locatie | Waarde | Consistent? |
|---------|--------|-------------|
| `app.json` → `expo.name` | **Lumen** | Referentie voor iOS home screen |
| `app.json` permission strings | “Lumen gebruikt…” | OK |
| `app.json` slug / scheme | `lumen-fashion` | OK |
| `src/constants/shareLinks.ts` → `SHARE_BRAND_NAME` | **Kwaapo** | Afwijkend — share-teksten |
| `src/screens/ShopScreen.tsx` kicker | **Kwaapo Store** | Afwijkend |
| `ProfileScreen` support mail subject | **Kwaapo support** | Afwijkend |
| `src/constants/appPolicies.ts` | **Lumen/Kwaapo** | Bewust dubbel in legal copy |
| `package.json` name | `lumen-fashion` | Technisch, niet zichtbaar |
| GitHub repo | Kwaapo | Buiten app bundle |
| `AGENTS.md` | “Kwaapo (Lumen)” | Documentatie |

**Actie vóór App Store:** kies één consumentennaam (Lumen **of** Kwaapo) voor UI, share-teksten en App Store Connect listing. Juridische teksten kunnen beide noemen indien nodig.

---

## 4. Bundle ID `com.lumen.fashion`

| Locatie | Waarde |
|---------|--------|
| `app.json` → `ios.bundleIdentifier` | `com.lumen.fashion` |
| `app.json` → `android.package` | `com.lumen.fashion` |

**Geen andere bundle/package IDs in applicatiecode.**

### Handmatig te controleren (buiten repo)

- [ ] Apple Developer → App ID `com.lumen.fashion` geregistreerd en uniek
- [ ] App Store Connect app record gebruikt dezelfde bundle ID
- [ ] Geen oud TestFlight-record met andere bundle ID
- [ ] EAS credentials gekoppeld aan juiste Apple Team

Geen conflict gedetecteerd **in de codebase** — Apple Developer portal moet jij verifiëren.

---

## 5. Placeholder / oude branding in de app

### Visuele assets in repo

| Bestand | Afmeting | Waar gebruikt | Release-geschikt? |
|---------|----------|---------------|-------------------|
| `assets/default-avatar.png` | 640×640 | `resolveAvatarSource.ts` — profiel zonder upload | In-app fallback OK; geen store asset |
| `assets/seller-mascot.png` | 640×640 | `SellerMascotDance.tsx` — seller UI | In-app feature OK; geen store asset |

### Remote / demo content (geen lokale bestanden)

| Bron | Waar | Opmerking |
|------|------|-----------|
| `src/data/placeholder.ts` → `REELS_POSTS` | Fallback/demo reels | **Unsplash URLs** — alleen als feed leeg is |
| `REEL_VIDEO_POSTER_FALLBACK` | Video zonder thumbnail | Unsplash URL |
| `src/constants/cloudVideo.ts` → `UPLOADED_VIDEO_OWNER` | `@mara.veldt` | Legacy demo handle; niet store-critical |

### Geen App Store screenshot assets in repo

Screenshots worden later handmatig gemaakt en geüpload naar App Store Connect — niet in git.

---

## 6. Android adaptive icon (later, zelfde release batch)

Niet blocking voor **iOS TestFlight**, wel nodig vóór Play Store.

| Bestand | Afmeting | Formaat |
|---------|----------|---------|
| `assets/adaptive-icon-foreground.png` | **1024 × 1024 px** | PNG, transparante achtergrond OK |
| Achtergrondkleur | — | Hex in config |

### `app.json` velden (Cursor koppelt later)

```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon-foreground.png",
    "backgroundColor": "#0B0B0B"
  }
}
```

---

## 7. App Store screenshots (later — niet in repo)

Apple vereist screenshots per device class. Minimaal voor iPhone (portrait app):

| Device class | Pixelafmeting (portrait) | Wanneer |
|--------------|--------------------------|---------|
| **6.7"** (iPhone 14/15/16 Pro Max) | **1290 × 2796** | Verplicht / primair |
| **6.5"** (iPhone 11 Pro Max, XS Max) | **1284 × 2778** | Vaak verplicht |
| **6.1"** (iPhone 14/15/16) | **1179 × 2556** | Aanbevolen |
| **5.5"** (iPhone 8 Plus) | **1242 × 2208** | Legacy, soms nog gevraagd |

Omdat `supportsTablet: true`:

| iPad Pro 12.9" | **2048 × 2732** | Indien tablet-screenshots vereist |

### Aanbevolen schermen om te fotograferen

1. Reels feed (home)
2. Shop / product grid
3. Product detail + koop
4. Checkout / order bevestiging
5. Profiel + settings met policies
6. Seller shop / order fulfillment (optioneel)

Opslag: **buiten git** (App Store Connect upload) of optioneel `marketing/screenshots/` (niet committen met persoonsgegevens).

---

## 8. Checklist — wat jij aanlevert vs Cursor

### Jij aanlevert

- [ ] `assets/icon.png` — 1024×1024, definitief Lumen (of gekozen) merk
- [ ] `assets/splash.png` — 1284×2778 (of 2732×2732 logo-only)
- [ ] Beslissing: Lumen vs Kwaapo in consumer-facing UI
- [ ] App Store screenshots (later)
- [ ] Optioneel: `assets/adaptive-icon-foreground.png` voor Android

### Cursor koppelt (na ontvangst assets)

- [ ] `"icon"` in `app.json`
- [ ] `"splash.image"` + `"resizeMode"` in `app.json`
- [ ] Optioneel: `android.adaptiveIcon` in `app.json`
- [ ] Optioneel: branding cleanup (Kwaapo → Lumen in share/shop UI) — **aparte taak, niet automatisch**

---

## 9. Thema-kleuren (referentie voor asset design)

| Token | Hex | Gebruik |
|-------|-----|---------|
| App background | `#0B0B0B` | Splash, dark UI |
| Accent | `#B9D9F7` | Kwaapo/Lumen pastel blue (theme) |

Icon en splash moeten leesbaar zijn op `#0B0B0B`.

---

## Gerelateerde docs

- `docs/EAS_RELEASE_CONFIGURATION.md` — EAS profielen en build commands
- `docs/PRE_DEPLOY_GO_NO_GO.md` — checklist vóór deploy
- `docs/APP_STORE_SUBMISSION_CHECKLIST.md` — metadata en screenshots
