# Demo & placeholder cleanup plan — Kwaapo

> **Status: PLAN ONLY — niet uitgevoerd.**  
> Geen automatische verwijdering zonder expliciet akkoord per fase.

Onderscheid:

| Categorie | Betekenis |
|-----------|-----------|
| **TestFlight** | Moet weg vóór interne TestFlight (testers zien dit) |
| **App Store** | Moet weg vóór publieke submission / review |
| **Legitiem Kwaapo** | Bewust onderdeel van product-ervaring — niet verwijderen |

---

## 1. Vóór interne TestFlight

| ID | Item | Locatie | Huidige staat | Actie | Risico |
|----|------|---------|---------------|-------|--------|
| TF1 | Demo reel dataset | `src/data/placeholder.ts` → `REELS_POSTS` | 8× Unsplash URLs, niet geïmporteerd | **Verwijderen** dead code of vervangen door lege array + comment | Laag |
| TF2 | Demo reel likes | `src/context/LikesContext.tsx` → `demoOverrides` | Local likes voor `reel-*` ids | **Verwijderen** demo pad als REELS_POSTS weg is | Laag |
| TF3 | Legacy upload owner | `src/constants/cloudVideo.ts` → `UPLOADED_VIDEO_OWNER` | `@mara.veldt` | **Verwijderen**; gebruik auth profile in `postsService` | Laag |
| TF4 | Video poster fallback | `REEL_VIDEO_POSTER_FALLBACK` in `placeholder.ts` | Unsplash URL | Vervangen door neutrale Kwaapo-kleur URL of lokaal asset | Laag |
| TF5 | Policy placeholders | `appPolicies.ts` | `[INVULLEN]` support + privacy URL | **Invullen** — blocker TestFlight metadata | Geen code delete |
| TF6 | App icon | `assets/icon.png` | ontbreekt | **Aanleveren** — EAS build blocker | — |
| TF7 | `@mara.veldt` comment | `placeholder.ts` comment regel 35 | Dev comment only | Update comment | Geen |

**Niet verwijderen vóór TestFlight:**

| Item | Reden |
|------|-------|
| `assets/seller-mascot.png` | Legitiem seller UX (Kwaapo fulfillment) |
| Live worker/Supabase feed | Echte content — geen demo |
| `PlaceholderScreen.tsx` | Generiek utility; alleen hernoemen indien verwarrend |

---

## 2. Vóór publieke App Store submission

| ID | Item | Locatie | Actie |
|----|------|---------|-------|
| AS1 | Unsplash in any user-visible fallback | `placeholder.ts` | Geen externe stock URLs in productie-paden |
| AS2 | `default-avatar.png` | `assets/default-avatar.png` | Vervangen door definitief Kwaapo default avatar design |
| AS3 | Demo accounts in review notes | `APP_STORE_SUBMISSION_CHECKLIST.md` | Echte test buyer/seller credentials invullen |
| AS4 | Juridische disclaimers | `appPolicies.ts` → `LEGAL_DISCLAIMER` | Advocaten-review |
| AS5 | Splash screen | `app.json` splash | Definitief Kwaapo splash image |
| AS6 | Screenshots | App Store Connect | Geen placeholder/lorem in metadata |
| AS7 | `[INVULLEN]` overal in docs/checklists | docs/* | Alle placeholders ingevuld |

---

## 3. Legitiem onderdeel van Kwaapo (behouden)

| Item | Locatie | Waarom behouden |
|------|---------|-----------------|
| `SHARE_BRAND_NAME = "Kwaapo"` | `shareLinks.ts` | Correct merk |
| “Kwaapo Store” kicker | `ShopScreen.tsx` | Marketplace branding |
| `seller-mascot.png` | `SellerMascotDance.tsx` | Seller fulfillment delight — geen Lumen/demo |
| `kwaapo_saved_product_ids` | `savedProductsService.ts` | Correct AsyncStorage namespace |
| Worker HTTPS checkout returns | `stripeCheckoutService.ts` | Productie flow |
| Format helpers in `placeholder.ts` | `formatLikesForDisplay`, etc. | Utility — geen demo content |
| `FeedPost` type in `placeholder.ts` | type export | Hernoemen bestand later optioneel (`feedTypes.ts`) — geen rush |

---

## 4. Voorgestelde uitvoeringsfasen

### Fase 1 — Pre-TestFlight code cleanup (aparte commit)

```
chore(cleanup): remove unused demo reel data and legacy owner constant
```

- Verwijder `REELS_POSTS`, `PROFILE_POSTS` (if unused)
- Verwijder `UPLOADED_VIDEO_OWNER` usage
- Simplify `LikesContext` demoOverrides
- Vervang `REEL_VIDEO_POSTER_FALLBACK` met non-Unsplash fallback

### Fase 2 — Assets (jij + Cursor koppeling)

- `assets/icon.png` 1024×1024
- `assets/splash.png`
- Optioneel: `assets/default-avatar.png` redesign

### Fase 3 — Pre-submission polish

- Juridische review
- App Store screenshots
- Verwijder resterende `[INVULLEN]`

---

## 5. Verificatie na cleanup

```bash
npx tsc --noEmit
# Handmatig: lege feed toont lege state, geen Unsplash
# Upload video: owner = ingelogde user, niet @mara.veldt
# Geen reel-1 ids in likes
```

---

## 6. Gerelateerde docs

- `docs/BRANDING_AND_DEMO_CONTENT_AUDIT.md`
- `docs/KWAAPO_IDENTIFIER_MIGRATION_PLAN.md`
- `docs/IOS_VISUAL_RELEASE_ASSETS.md`
