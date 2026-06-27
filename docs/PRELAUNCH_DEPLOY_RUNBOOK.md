# Pre-launch deploy runbook — gecombineerde uitrol

> **Status: RUNBOOK ONLY** — nog niets deployen tot je dit document stap voor stap afvinkt.  
> **Scope:** migrations 0034–0037, JWT worker security, notifications, moderation/account deletion, refund-flow, nieuwe app-build met Bearer JWT.

**Kernprincipe:** worker deploy met JWT **breekt oude app-builds** op private routes. Plan één release window: migrations → worker → nieuwe build → smoke test **binnen dezelfde sessie**.

### Worker endpoint (uit repo + live check)

| Item | Waarde |
|------|--------|
| Wrangler worker name | `wild-mountain-072a` (`wrangler.jsonc`) |
| App / code base URL | `https://wild-mountain-072a.n-vandullemen.workers.dev` (`src/constants/cloudVideo.ts`) |
| Stripe webhook URL | `https://wild-mountain-072a.n-vandullemen.workers.dev?stripeWebhook=1` |

**Geen placeholder in de app:** de URL hierboven is de **canonieke productie-URL** zoals in de codebase. Vóór je deze URL in **Stripe** zet, bevestig handmatig dat de worker live reageert:

```bash
curl.exe "https://wild-mountain-072a.n-vandullemen.workers.dev?health=1"
```

| Controle | Waar |
|----------|------|
| Worker bestaat en is actief | [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **wild-mountain-072a** → **Deployments** |
| URL matcht app | Gelijk aan `CLOUD_VIDEO_WORKER_BASE` in `src/constants/cloudVideo.ts` |
| Health check | `?health=1` → HTTP 200 (JSON `{ ok: true }` of vergelijkbaar) |

Als de URL niet reageert of in Cloudflare een andere hostname toont: **stop** — eerst deploy/account controleren; **niet** Stripe webhook aanmaken op een verkeerde URL.

Test en live mode in Stripe gebruiken **dezelfde webhook URL**; signing secrets (`whsec_…`) verschillen per endpoint/mode.

---

## Overzicht volgorde

| Fase | Wat | Geschat |
|------|-----|---------|
| A | Pre-checks | 30–60 min |
| B | Supabase migrations 0034 → 0037 | 15–30 min |
| C | Worker deploy | 5 min |
| D | Stripe webhooks (testmode) | 15 min |
| E | Testmode smoke test | 60–90 min |
| F | Go/no-go → TestFlight / live | besluit |

**Niet omkeren:** migrations volgorde; worker vóór refund-test; JWT-build vóór worker **niet** installeren na worker (oude build = 401).

---

## A. Pre-checks

### A1 — Apple / TestFlight oude builds

| | |
|--|--|
| **Handmatig** | Inventariseer wie welke build gebruikt. |
| **Dashboard** | [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → Kwaapo/Lumen → **TestFlight** → **Builds** + **Internal/External Testing** groepen. |
| **Controle vóór verder** | [ ] Geen **externe** testers op oude build **zonder** plan, **of** je accepteert dat zij na worker-deploy checkout/upload verliezen. |
| **Stop / rollback** | **Stop** deploy als externe TestFlight actief is zonder communicatie. Rollback worker later alleen met security-risico — plan liever **forward fix** (nieuwe build pushen). |

---

### A2 — Bundle ID besluit

| | |
|--|--|
| **Handmatig** | Kies **één** pad vóór `eas init` / eerste TestFlight-build. |
| **Dashboard** | [Apple Developer](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Identifiers** — zoek `com.lumen.fashion`. |
| **Optie 1 — Behouden (sneller)** | Houd `com.lumen.fashion` in `app.json`. Geen identifier-migratie. |
| **Optie 2 — Migreren naar Kwaapo** | Alleen als **geen** bestaande ASC-app/TestFlight onder `com.lumen.fashion`. Zie `docs/KWAAPO_IDENTIFIER_MIGRATION_PLAN.md` — **aparte commit vóór EAS build**, niet tijdens migration-window. |
| **Controle vóór verder** | [ ] Besluit vastgelegd. [ ] `app.json` `bundleIdentifier` matcht Apple Identifier. |
| **Stop** | **Stop** als je midden in deploy bundle ID wilt wijzigen — eerst afmaken of plan resetten. |

---

### A3 — Supabase backup

| | |
|--|--|
| **Handmatig** | Noteer timestamp backup. |
| **Dashboard** | [Supabase Dashboard](https://supabase.com/dashboard) → project → **Database** → **Backups** → manual backup (Pro) of noteer laatste automatic backup. |
| **Terminal** | Optioneel snapshot counts: |
| | ```sql |
| | select 'orders' t, count(*) from orders |
| | union all select 'products', count(*) from products |
| | union all select 'profiles', count(*) from profiles; |
| | ``` |
| **Controle vóór verder** | [ ] Backup ≤ 24u oud of manual backup gemaakt. |
| **Stop** | **Geen migrations** zonder backup. |

---

### A4 — Stripe testmode vs live mode

| | |
|--|--|
| **Handmatig** | Pre-launch smoke = **testmode only**. Live pas na F go/no-go. |
| **Dashboard** | [Stripe Dashboard](https://dashboard.stripe.com) → toggle **Test mode** (rechtsboven). |
| **Controle** | [ ] Worker `STRIPE_SECRET_KEY` = `sk_test_…` voor smoke. [ ] Geen live keys in `.dev.vars` tijdens test. |
| **Stop** | **Stop** als test/live keys gemixt zijn — roteer en corrigeer secrets eerst. |

---

### A5 — Worker secrets

| | |
|--|--|
| **Handmatig** | Checklist secrets (productie/test worker). |
| **Dashboard** | [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **wild-mountain-072a** → **Settings** → **Variables and Secrets**. |
| **Vereist** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `KVK_API_KEY`; optioneel `KVK_API_BASE`, `WORKER_PUBLIC_URL`, checkout return URLs. |
| **Terminal (lokaal verifiëren)** | ```bash |
| | npx wrangler secret list |
| | ``` |
| **Controle vóór verder** | [ ] Alle secrets aanwezig. [ ] Geen secrets in git. Zie `docs/SECRETS_AUDIT.md`. |
| **Stop** | **Geen worker deploy** met ontbrekende `SUPABASE_*` of Stripe keys. |

---

### A6 — SUPPORT_EMAIL en PRIVACY_POLICY_WEB_URL

| | |
|--|--|
| **Handmatig** | Vul placeholders in vóór TestFlight (blocker voor App Store, aanbevolen vóór interne test). |
| **Bestand** | `src/constants/appPolicies.ts` — `SUPPORT_EMAIL`, `PRIVACY_POLICY_WEB_URL`. |
| **Dashboard** | Privacy URL moet publiek bereikbaar zijn (eigen site / Notion / GitHub Pages). |
| **Controle** | [ ] Geen `[INVULLEN]` meer. [ ] `mailto:SUPPORT_EMAIL` werkt. [ ] Privacy URL laadt in browser. |
| **Stop** | **Stop TestFlight extern** als placeholders nog staan (intern team mag desnoods door met known limitation). |

---

### A7 — Test buyer en seller accounts

| | |
|--|--|
| **Handmatig** | Twee Supabase-auth accounts + devices/simulators. |
| **Dashboard** | Supabase → **Authentication** → **Users** — noteer buyer/seller UUIDs. |
| **Seller vereist** | Stripe Connect onboarding compleet (testmode), KVK verified, seller terms geaccepteerd (na 0035), product met voorraad ≥ 1. |
| **Controle** | [ ] Buyer ingelogd op device A. [ ] Seller ingelogd op device B (ofzelfde device, uitloggen tussen tests). [ ] Testproduct `is_active`, `moderation_status=approved` (na 0036). |
| **Stop** | **Stop smoke** als seller niet payout-ready — checkout faalt. |

---

### A8 — EAS / app-build voorbereiding (vóór worker deploy start)

| | |
|--|--|
| **Handmatig** | EAS klaarzetten zodat build direct na worker kan starten. |
| **Terminal** | ```bash |
| | npx eas-cli@latest login |
| | npx eas-cli@latest init          # eenmalig — projectId in app.json |
| | npx eas-cli@latest env:list      # EXPO_PUBLIC_SUPABASE_* per profile |
| | ``` |
| **Dashboard** | [expo.dev](https://expo.dev) → project → **Environment variables**. |
| **Controle** | [ ] App icon 1024×1024 aanwezig (`docs/IOS_VISUAL_RELEASE_ASSETS.md`). [ ] Code op `main` incl. JWT (`d17b4b9`) + refunds (`af56d9a`). |
| **Stop** | **Stop worker deploy** als geen JWT-capable build binnen 1–2 uur kan worden geïnstalleerd. |

---

## B. Supabase migrations (0034 → 0035 → 0036 → 0037)

**Methode A — CLI (aanbevolen als project gelinkt):**

```bash
cd "c:\Users\nvand\Documents\Cursor Projecten\Sociaal media app Cursor"
npx supabase@latest login
npx supabase@latest link    # eenmalig
npx supabase@latest db push
```

**Methode B — SQL Editor (handmatig per bestand):**

Dashboard → **SQL Editor** → plak **één** migration → **Run** → verify → volgende.

**Algemeen bij migration-fout:**

| Situatie | Actie |
|----------|--------|
| Syntax error / halverwege stop | **Stop.** Fix SQL lokaal, **niet** doorgaan naar volgende migration. Herstel from backup indien partial state onduidelijk. |
| "relation already exists" | Migration deels al gedraaid — inspecteer schema, run alleen ontbrekende delen of markeer migration applied in `supabase_migrations.schema_migrations`. |
| RLS/policy conflict | Noteer exacte error; zie `docs/PRE_DEPLOY_MIGRATION_0036.md` rollback sectie. |

**Wat niet live mag zonder worker deploy:**

| Onderdeel | Waarom |
|-----------|--------|
| Refund webhooks (`charge.refunded`) | Worker handler + RPC `apply_full_order_refund` |
| Seller `order_refunded` notifications | Worker insert na refund |
| JWT-only upload/checkout | Worker `requireAuthUser` |
| Buyer ship notifications (0036 trigger) | Werkt na migration, maar E2E via app + worker |

---

### B1 — Migration 0034 (`seller_notifications`)

| | |
|--|--|
| **Bestand** | `supabase/migrations/0034_seller_notifications.sql` |
| **Dashboard** | Supabase → **SQL Editor** |
| **Verify** | ```sql |
| | select count(*) from information_schema.tables |
| | where table_schema = 'public' and table_name = 'seller_notifications'; |
| | -- verwacht: 1 |
| | select indexname from pg_indexes where tablename = 'seller_notifications'; |
| | ``` |
| **Controle vóór B2** | [ ] Tabel bestaat. [ ] Geen error in SQL output. |
| **Rollback** | ```sql |
| | drop table if exists public.seller_notifications cascade; |
| | ``` (alleen als geen prod data; na paid orders met notifications: voorzichtig) |

---

### B2 — Migration 0035 (`seller_terms_acceptance`)

| | |
|--|--|
| **Bestand** | `supabase/migrations/0035_seller_terms_acceptance.sql` |
| **Verify** | ```sql |
| | select column_name from information_schema.columns |
| | where table_name = 'profiles' |
| | and column_name in ('seller_terms_version','seller_terms_accepted_at'); |
| | ``` |
| **Controle vóór B3** | [ ] Kolommen bestaan. Sellers kunnen terms alsnog accepteren in app. |
| **Rollback** | Kolommen droppen alleen indien nodig; geen dataverlies kritiek. |

---

### B3 — Migration 0036 (`prelaunch_compliance`)

| | |
|--|--|
| **Bestand** | `supabase/migrations/0036_prelaunch_compliance.sql` |
| **Verify** | ```sql |
| | select moderation_status, count(*) from products group by 1; |
| | -- verwacht: bestaande actief → 'approved' |
| | select count(*) from information_schema.tables |
| | where table_name in ('buyer_notifications','moderation_reports','account_deletion_requests'); |
| | select proname from pg_proc where proname = 'request_account_deletion'; |
| | ``` |
| **Controle vóór B4** | [ ] Buyer notifications tabel. [ ] Products moderation backfill OK. [ ] Geen failed statements. |
| **Rollback** | Zie `docs/PRE_DEPLOY_MIGRATION_0036.md` — handmatig, geen auto-down. |
| **Risico** | Posts/products RLS stricter — worker **moet** service_role gebruiken (al zo). |

---

### B4 — Migration 0037 (`order_full_refund_phase1`)

| | |
|--|--|
| **Bestand** | `supabase/migrations/0037_order_full_refund_phase1.sql` |
| **Vereist** | 0034 + 0036 (notification type checks). |
| **Verify** | ```sql |
| | select count(*) from information_schema.tables |
| | where table_name = 'order_payment_events'; |
| | select proname from pg_proc |
| | where proname in ('apply_full_order_refund','restore_product_stock_for_refunded_order'); |
| | select column_name from information_schema.columns |
| | where table_name = 'orders' and column_name = 'refund_requires_return'; |
| | ``` |
| **Controle vóór C** | [ ] RPC's bestaan. [ ] `order_payment_events` leeg. [ ] Bestaande orders ongewijzigd. |
| **Rollback** | ```sql |
| | drop function if exists public.apply_full_order_refund(uuid,text,int,text); |
| | drop function if exists public.restore_product_stock_for_refunded_order(uuid); |
| | drop table if exists public.order_payment_events; |
| | -- kolommen orders optioneel laten staan |
| | ``` + worker terug naar versie zonder refund handler. |

---

## C. Worker deploy

### C1 — Deploy

| | |
|--|--|
| **Terminal** | ```bash |
| | cd "c:\Users\nvand\Documents\Cursor Projecten\Sociaal media app Cursor" |
| | npm run deploy:worker |
| | # equivalent: npx wrangler deploy |
| | ``` |
| **Dashboard** | Cloudflare → **Workers** → `wild-mountain-072a` → **Deployments** — nieuwste versie active. |
| **Controle vóór D** | [ ] Deploy succeeded. [ ] Health OK: |
| | ```bash |
| | curl.exe "https://wild-mountain-072a.n-vandullemen.workers.dev?health=1" |
| | ``` |

---

### C2 — JWT auth werkt

| | |
|--|--|
| **Handmatig** | Installeer **nieuwe** app-build (Bearer headers) — oude build **mag** 401 geven. |
| **Test zonder JWT (verwacht 401)** | ```bash |
| | curl -X POST "https://<worker>/?stripeCheckout=1" -H "Content-Type: application/json" -d "{\"orderId\":\"test\"}" |
| | ``` |
| **Test met JWT** | Via app: login → checkout / upload — moet slagen. |
| **Controle** | [ ] Private routes 401 zonder Bearer. [ ] Met app JWT: checkout init werkt. |
| **Breaking change** | Oude builds krijgen **401** op: upload, checkout, Connect, KVK, soft-delete. Zie `docs/WORKER_ROUTES_AUTH.md`. |

---

### C3 — Checkout, upload, seller actions

| | |
|--|--|
| **Handmatig** | Via **nieuwe** build alleen (niet Expo Go zonder JWT patch). |
| **Controle** | [ ] Stripe checkout session URL returned. [ ] Video upload init → complete. [ ] Product publish. [ ] Connect status leesbaar. |
| **Stop** | **Stop smoke / rollback plan** als checkout 500 — check worker logs (Cloudflare → **Logs** → **Live**). Fix forward preferred. |

---

### C4 — Rollback worker (nood)

| | |
|--|--|
| **Dashboard** | Cloudflare → Worker → **Deployments** → vorige versie → **Rollback to this deployment**. |
| **Waarschuwing** | Oude worker **zonder** JWT = security regression. Alleen tijdelijk diagnostisch. |
| **Prefer** | Fix forward + redeploy. |

---

## D. Stripe webhooks

### D0 — Endpoint URL (testmode en live)

**Stripe webhook URL (canoniek — zelfde als app):**

```
https://wild-mountain-072a.n-vandullemen.workers.dev?stripeWebhook=1
```

Bron: `src/constants/cloudVideo.ts` + `wrangler.jsonc` name `wild-mountain-072a`.

**Vóór Stripe:** bevestig dat de worker op deze URL live reageert (bewijs dat het geen dode URL is):

```bash
curl.exe -s -o NUL -w "HTTP %{http_code}\n" "https://wild-mountain-072a.n-vandullemen.workers.dev/?posts=1"
# verwacht: HTTP 200

curl.exe "https://wild-mountain-072a.n-vandullemen.workers.dev/?health=1"
# verwacht na recente deploy: {"ok":true} — anders worker opnieuw deployen
```

---

### D1 — Testmode webhooks instellen

| | |
|--|--|
| **Dashboard** | Stripe → **Developers** → **Webhooks** → **Add endpoint** (zorg dat **Test mode** aan staat). |
| **Events selecteren (exact deze 7)** | |
| | `checkout.session.completed` |
| | `checkout.session.async_payment_succeeded` |
| | `checkout.session.expired` |
| | `payment_intent.payment_failed` |
| | `account.updated` |
| | `charge.refunded` |
| | `refund.updated` |
| **Niet toevoegen** | `refund.created`, `charge.dispute.*`, `payment_intent.succeeded` (redundant). |
| **Signing secret** | Kopieer `whsec_…` na aanmaken. |

---

### D2 — Signing secret in Cloudflare

| | |
|--|--|
| **Terminal** | ```bash |
| | npx wrangler secret put STRIPE_WEBHOOK_SECRET |
| | # plak whsec_... wanneer gevraagd |
| | ``` |
| **Dashboard** | Cloudflare → Worker → **Settings** → **Variables and Secrets** → verify `STRIPE_WEBHOOK_SECRET` (encrypted). |
| **Controle** | [ ] Secret gezet **na** endpoint aanmaken (test vs live hebben **verschillende** whsec). |

---

### D3 — Webhook delivery testen

| | |
|--|--|
| **Dashboard** | Stripe → **Webhooks** → endpoint → **Send test webhook** → kies `checkout.session.completed` of `charge.refunded`. |
| **Dashboard** | Stripe → endpoint → **Event deliveries** — status **200**. |
| **Cloudflare** | Worker **Logs** — zoek `[stripeWebhook] event evt_…`. |
| **Controle vóór E** | [ ] Test event 200. [ ] Geen `Missing STRIPE_WEBHOOK_SECRET` in logs. |
| **Stop** | Fix secret URL/signature vóór echte checkout smoke. |

---

### D4 — Live mode (pas na F go/no-go)

| | |
|--|--|
| **Dashboard** | Stripe → schakel **Live mode** → **Webhooks** → **nieuw endpoint** (zelfde 7 events, zelfde URL). |
| **Terminal** | ```bash |
| | npx wrangler secret put STRIPE_SECRET_KEY    # sk_live_... |
| | npx wrangler secret put STRIPE_WEBHOOK_SECRET  # live whsec_... |
| | ``` |
| **Waarschuwing** | Live secret overwrite — plan moment; geen test/live mix in één key. |

---

## E. Testmode smoke test

**Voorwaarden:** migrations 0034–0037 ✓, worker deployed ✓, webhooks testmode ✓, **nieuwe app-build** met JWT ✓, Stripe **testmode** ✓.

**Refund pre-ship (API, niet Dashboard blind):**

```bash
curl https://api.stripe.com/v1/refunds \
  -u "sk_test_JOUW_KEY:" \
  -d charge="ch_..." \
  -d reverse_transfer=true \
  -d refund_application_fee=true
```

Zie `docs/REFUNDS_PHASE1_TEST_MATRIX.md` voor Dashboard-risico's.

### Checklist

```text
[ ] Checkout → betaald → seller notification
[ ] Verify application fee / transfer in Stripe
[ ] Seller markeert als verzonden
[ ] Buyer ziet “Onderweg”
[ ] Refund vóór verzending via Stripe API met reverse_transfer=true en refund_application_fee=true
[ ] Order refunded + stock terug + buyer/seller notification
[ ] Webhook opnieuw afspelen → geen dubbele voorraad
[ ] Refund na verzending → refund_requires_return=true + geen voorraadherstel
[ ] Video upload werkt
[ ] Product upload/publiceren werkt
[ ] Account deletion request werkt
[ ] Product report werkt
```

### Verify-queries (na refund tests)

```sql
-- Pre-ship refund
select id, payment_status, status, shipping_status, refund_requires_return, stock_restored_at
from orders where id = '<order_id>';

select stripe_event_id from order_payment_events where order_id = '<order_id>';

-- Stock
select stock from products where id = '<product_id>';

-- Notifications (geen adressen in body)
select notification_type, title from seller_notifications where order_id = '<order_id>';
select notification_type, title from buyer_notifications where order_id = '<order_id>';
```

| Failure | Stop? |
|---------|-------|
| Checkout faalt | **Stop** — fix worker/Stripe Connect |
| Refund order blijft paid | **Stop** — check webhook + RPC logs; retry moet 500→200 |
| Dubbele stock na replay | **Stop** — P1 regression |
| Upload 401 | **Stop** — JWT build niet geïnstalleerd |
| Account deletion error | **Stop** — 0036 RPC/RLS |

---

## F. Go / no-go

### Groen — veilig naar interne TestFlight

Alle **E** checklist items groen **en**:

- [ ] Pre-checks A compleet
- [ ] Geen open P0 bugs in smoke
- [ ] `SUPPORT_EMAIL` + privacy URL ingevuld (voor bredere test)
- [ ] Team begrijpt: oude builds broken na worker deploy
- [ ] Refund pre-ship + duplicate webhook getest

**Actie:** `eas build --profile preview --platform ios` → internal TestFlight groep.

---

### Rood — absoluut stoppen

- Externe TestFlight zonder plan + worker al deployed
- Geen backup vóór migrations
- Migration 0036/0037 partial failure onduidelijk
- Checkout/upload broken op **nieuwe** build
- Refund webhook: order paid terwijl Stripe refunded + event ledger blocks retry
- Worker secrets ontbreken / verkeerde Stripe mode
- Placeholders in policies **en** externe testers

**Actie:** geen bredere TestFlight; geen live Stripe; diagnose → fix forward.

---

### Live Stripe-betalingen — pas wanneer

**Alle** van:

- [ ] Interne TestFlight 3–7 dagen stabiel
- [ ] Live webhook endpoint + `sk_live_` secrets bewust gezet
- [ ] App Store / legal review privacy + seller terms
- [ ] Refund admin runbook team bekend (`docs/REFUNDS_PHASE1_TEST_MATRIX.md`)
- [ ] Bewuste beslissing destination charges + 12,5% fee in live

**Niet** tijdens eerste smoke sessie.

---

## Snelle referentie — documenten

| Onderwerp | Document |
|-----------|----------|
| JWT breaking change | `docs/JWT_BREAKING_CHANGE_RELEASE_PLAN.md` |
| Worker auth matrix | `docs/WORKER_ROUTES_AUTH.md` |
| Migration 0036 rollback | `docs/PRE_DEPLOY_MIGRATION_0036.md` |
| Refund pre-deploy | `docs/REFUNDS_PHASE1_PRE_DEPLOY_REVIEW.md` |
| Refund test + admin | `docs/REFUNDS_PHASE1_TEST_MATRIX.md` |
| EAS builds | `docs/EAS_RELEASE_CONFIGURATION.md` |
| Stripe live | `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md` |
| Go/no-go checklist | `docs/PRE_DEPLOY_GO_NO_GO.md` |
| Bundle ID migratie | `docs/KWAAPO_IDENTIFIER_MIGRATION_PLAN.md` |

---

## Release window template (invullen op deploy-dag)

| Tijd | Stap | Door | OK? |
|------|------|------|-----|
| | A Pre-checks | | |
| | B1–B4 Migrations | | |
| | C Worker deploy | | |
| | D Stripe webhooks test | | |
| | E Smoke test | | |
| | F Besluit TestFlight | | |

**Noodcontact / rollback owner:** _________________
