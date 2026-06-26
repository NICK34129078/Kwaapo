# JWT breaking change — release plan (pre-public launch)

Commit `d17b4b9` vervangt client-gestuurde `X-App-User-Id` door server-side JWT-validatie op alle private worker-routes. **Er is geen fallback naar `X-App-User-Id` — dat mag onder geen enkele omstandigheid terugkomen als autorisatie.**

## Breaking change — wat stopt na worker-deploy

Oude app-builds (alleen `X-App-User-Id`, geen `Authorization: Bearer`) krijgen **401 Unauthorized** op:

- Video- en carousel-upload (init, PUT, complete, thumbnail, multipart)
- Stripe checkout, payment confirm, stock release
- Stripe Connect (onboarding, status, payout dashboard)
- KVK-verificatie
- Post soft-delete via worker

Publieke routes blijven werken: feed, media stream, share pages, health check, Stripe webhook (signature).

Supabase-direct calls (orders lezen via client, profiel) blijven werken tot RLS-migrations actief zijn — maar checkout/upload/seller-acties via worker breken onmiddellijk.

## Acceptabel vóór publieke launch

Dit is **acceptabel zolang de app nog niet publiek live is** en geen externe gebruikers afhankelijk zijn van een oude build.

Als er **wél** externe TestFlight- of App Store-gebruikers op een oude build zitten: **niet deployen** tot een release- en communicatiestrategie is gekozen (forced update, maintenance window, of wachten op App Store review van nieuwe build).

---

## Veilige volgorde (pre-public launch)

### Stap 0 — Go/no-go

- [ ] Bevestig dat er **geen externe gebruikers** afhankelijk zijn van oude builds (alleen intern team / geen TestFlight buiten team).
- [ ] Bevestig dat er **geen geautomatiseerde clients** zijn die worker-routes aanroepen zonder Bearer JWT (scripts, CI, oude dev builds op fysieke devices).

### Stap 1 — Database backup

- [ ] Supabase Dashboard → **Database → Backups** → noteer laatste backup of maak manual backup (Pro plan).

### Stap 2 — Migrations (in volgorde)

```bash
# Via Supabase CLI (vanuit project root):
supabase db push

# Of handmatig in SQL Editor, één voor één:
# supabase/migrations/0034_seller_notifications.sql
# supabase/migrations/0035_seller_terms_acceptance.sql
# supabase/migrations/0036_prelaunch_compliance.sql
```

Volgorde is verplicht: **0034 → 0035 → 0036**.

### Stap 3 — Worker deploy (JWT)

```bash
# Vanuit project root — pas account/zone aan indien nodig
npx wrangler deploy
```

Worker secrets moeten geconfigureerd zijn: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, KVK key (zie `.dev.vars.example`).

**Vanaf dit moment breken oude app-builds op private worker-routes.**

### Stap 4 — Nieuwe EAS build (internal / TestFlight)

Bouw en installeer **direct na** worker deploy (zelfde release window, binnen minuten):

```bash
# Internal development build (snelste validatie)
eas build --profile development --platform ios

# Of TestFlight
eas build --profile production --platform ios
eas submit --platform ios
```

De app moet commits bevatten: `d17b4b9` (Bearer headers) + `ce65e17` + `e549676`.

### Stap 5 — Onmiddellijke E2E-test (twee accounts)

Test **binnen het release window** met buyer + seller account:

| # | Test | Verwacht |
|---|------|----------|
| 1 | Buyer koopt product | Checkout slaagt, order `paid` |
| 2 | Seller ziet betaalde order | Order zichtbaar in My Shop / orders |
| 3 | Seller uploadt / publiceert product | Upload + publish slaagt |
| 4 | Seller markeert pakket als verzonden | Shipping status `shipped` |
| 5 | Buyer ziet status | Order detail toont verzonden |
| 6 | Video upload | Init → PUT → complete werkt |
| 7 | Account deletion request | Profiel verborgen, logout |
| 8 | Report / block | Melding aangemaakt, block actief |

Bij **één failure**: rollback worker indien nodig (vorige versie zonder JWT — **alleen als security-fix tijdelijk teruggedraaid mag worden**, wat niet de bedoeling is) of fix forward + redeploy. Prefer: fix forward in hetzelfde window.

### Stap 6 — Bredere TestFlight

- [ ] Alleen na succesvolle E2E (stap 5): uitnodigen bredere TestFlight-groep.

### Stap 7 — App Store submission

- [ ] Pas na stabiele TestFlight: submission voorbereiden (`docs/APP_STORE_SUBMISSION_CHECKLIST.md`).

---

## Aanbevolen release window

| Fase | Duur | Actie |
|------|------|-------|
| Voorbereiding | 30 min | Backup, migrations, worker deploy klaarzetten |
| Deploy | 5–15 min | Migrations → worker → EAS build start |
| Validatie | 30–60 min | Internal build installeren + E2E checklist |
| Uitbreiding | +1–2 dagen | Bredere TestFlight na groen |

Plan deploy buiten piekuren; houd team beschikbaar voor hotfix.

---

## Intern testen vóór worker live

**Ja — aanbevolen:**

1. Bouw EAS internal build **vóór** worker deploy (met JWT-client code).
2. Test tegen **huidige** worker (nog zonder JWT) — upload/checkout falen al (geen Bearer op oude worker). **Dus:** internal build moet **tegelijk** met worker getest worden, niet los.

Praktisch: migrations kunnen eerder op staging; worker + app altijd als **atomic pair**.

---

## Rollback (noodgeval)

| Component | Rollback |
|-----------|----------|
| Migrations 0034–0036 | Handmatig (zie `docs/PRE_DEPLOY_MIGRATION_0036.md`) — geen auto-down |
| Worker | `wrangler rollback` naar vorige versie — **herstelt X-App-User-Id trust (onveilig)** — alleen noodgeval |
| App | Vorige TestFlight build — werkt niet met JWT-only worker |

**Security-fix niet terugdraaien tenzij absoluut noodzakelijk.** Fix forward preferred.

---

## Gerelateerde docs

- `docs/WORKER_ROUTES_AUTH.md` — route auth matrix
- `docs/PRE_DEPLOY_MIGRATION_0036.md` — backup/rollback migrations
- `docs/SECRETS_AUDIT.md` — secrets vs publiek
- `docs/APP_STORE_SUBMISSION_CHECKLIST.md` — submission checklist
