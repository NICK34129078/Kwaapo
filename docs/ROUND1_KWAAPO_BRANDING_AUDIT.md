# Ronde 1 — Kwaapo branding audit (read-only)

> Geen bundle identifier, scheme of slug gewijzigd. Wacht op expliciet akkoord vóór identifier-migratie.

Volledige audit staat in [`BRANDING_AND_DEMO_CONTENT_AUDIT.md`](./BRANDING_AND_DEMO_CONTENT_AUDIT.md) en [`KWAAPO_IDENTIFIER_MIGRATION_PLAN.md`](./KWAAPO_IDENTIFIER_MIGRATION_PLAN.md).

## 1. Alle Lumen / lumen-fashion / com.lumen.fashion verwijzingen

| Bestand | Waarde | Type |
|---------|--------|------|
| `app.json` | `slug`: `lumen-fashion` | Expo/EAS technisch |
| `app.json` | `scheme`: `lumen-fashion` | Deep links |
| `app.json` | `ios.bundleIdentifier` / `android.package`: `com.lumen.fashion` | Apple/Google ID |
| `package.json` / `package-lock.json` | `name`: `lumen-fashion` | npm (dev-only) |
| `App.tsx` | linking prefix `lumen-fashion://` | Deep links |
| `src/constants/shareLinks.ts` | `APP_SCHEME = "lumen-fashion"` | Share/deep links |
| `worker.js` | defaults `lumen-fashion://post/`, checkout comments | Server |
| `worker-stripe.js` | checkout success/cancel defaults | Stripe return URLs |
| `.dev.vars.example` | comment voorbeelden `lumen-fashion://` | Docs |
| `docs/*` | diverse checklist refs | Documentatie |

**User-facing copy:** `expo.name` = **Kwaapo**; permission strings = “Kwaapo gebruikt…”; policies/shop UI = Kwaapo.

## 2. Veilig direct naar Kwaapo (alleen zichtbare copy)

Reeds gedaan in eerdere passes — geen extra wijzigingen in Ronde 1:

- App-naam op home screen (`app.json` → `name`)
- iOS permission descriptions
- In-app policies, shop labels, share brand name

## 3. Breaking / extern afhankelijk — niet zonder plan wijzigen

| Item | Impact |
|------|--------|
| `com.lumen.fashion` | Apple Developer, ASC, provisioning, TestFlight |
| `lumen-fashion` scheme | OAuth redirects, Supabase Auth redirect URLs, Stripe return URLs, gedeelde links |
| `lumen-fashion` slug | EAS project URL, OTA channels na `eas init` |
| `worker.js` / `worker-stripe.js` | Wrangler env + deployed defaults |

## 4. Veilig migratievoorstel vóór eerste release-build

Zie [`KWAAPO_IDENTIFIER_MIGRATION_PLAN.md`](./KWAAPO_IDENTIFIER_MIGRATION_PLAN.md):

1. Go/no-go: bestaat ASC/TestFlight al onder `com.lumen.fashion`?
2. Zo **nee** → één gecommit migratie-window: `com.kwaapo.app`, slug/scheme `kwaapo`, sync Supabase redirects + worker env.
3. Zo **ja** → behoud `com.lumen.fashion`; alleen consumer name Kwaapo (huidige situatie).

**Ronde 1 heeft identifiers niet aangepast.**
