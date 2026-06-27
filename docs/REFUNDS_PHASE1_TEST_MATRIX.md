# Fase 1 — Volledige refunds: testmatrix & admin runbook

> **Status: PLAN ONLY** — geen code, migration of deploy.  
> Bron: `docs/REFUNDS_CHARGEBACKS_AND_STOCK_PLAN.md` + businessregels vóór verzending vs. na verzending.

---

## Businessregels (Fase 1)

### Refund vóór verzending (`shipping_status = not_shipped`)

| Veld / actie | Waarde |
|--------------|--------|
| `payment_status` | `refunded` |
| `status` | `refunded` |
| `shipping_status` | `not_shipped` (ongewijzigd) |
| Voorraad | **Herstellen**, exact één keer |
| `refund_requires_return` | `false` |
| Seller notification | “De bestelling is terugbetaald. Verzend dit pakket niet.” |
| Buyer notification | “Je bestelling is terugbetaald.” |

### Refund ná verzending (`shipping_status = shipped` of `delivered`)

| Veld / actie | Waarde |
|--------------|--------|
| `payment_status` | `refunded` |
| `status` | `refunded` |
| `shipping_status` | **Historisch behouden** (`shipped` / `delivered`) |
| Voorraad | **Geen** automatisch herstel |
| `refund_requires_return` | `true` |
| `stock_restored_at` | blijft `null` tot aparte retour-flow (Fase 2+) |
| Seller notification | “De bestelling is terugbetaald. Het pakket staat al als verzonden; volg de retour-/supportinstructies.” |
| Buyer notification | “Je bestelling is terugbetaald. Neem contact op met support als retourinstructies nodig zijn.” |

### Toekomstige retour-flow (Fase 1: alleen kolommen, geen UI)

Voorraad na verzending mag **alleen** terug via:

- `return_approved_at`
- `returned_received_at`
- `stock_restored_at` (gezet door aparte RPC, niet door refund-webhook)

Fase 1 legt de kolommen aan; geen return UI of seller-acties.

---

## Admin runbook — refunds initiëren

### Waarom niet blind Stripe Dashboard gebruiken

Bij **destination charges** (Kwaapo-model):

- Een refund via **Stripe Dashboard** debiteert doorgaans het **platformaccount**.
- De **seller transfer** wordt **niet automatisch** teruggehaald tenzij expliciet `reverse_transfer=true` (API).
- De **application fee** (12,5%) wordt **niet automatisch** teruggegeven tenzij `refund_application_fee=true` (API).

**Risico Dashboard-refund zonder API-flags:** platform betaalt buyer terug, seller behoudt netto-opbrengst → financieel verlies + reconciliatieprobleem.

### Aanbevolen procedure (volledige refund)

**Optie A — Stripe API (aanbevolen)**

```bash
curl https://api.stripe.com/v1/refunds \
  -u "$STRIPE_SECRET_KEY:" \
  -d charge="ch_..." \
  -d reverse_transfer=true \
  -d refund_application_fee=true
```

- `charge`: `ch_…` van PaymentIntent, of refund op `payment_intent=pi_…` (order heeft `stripe_payment_intent_id`).
- `reverse_transfer=true`: haalt seller-deel terug van connected account.
- `refund_application_fee=true`: geeft platform fee terug aan buyer (volledige refund → volledige fee).

Webhook `charge.refunded` verwerkt daarna order + notifications in de app (Fase 1).

**Optie B — Stripe Dashboard (alleen met handmatige follow-up)**

1. Dashboard → Payments → Refund payment (full).
2. **Direct daarna controleren in Stripe:**
   - Connected account balance: is transfer (deel van seller_amount) teruggehaald?
   - Platform balance: application fee — is die teruggeboekt?
3. **Indien transfer niet automatisch reversed:**
   - Stripe Dashboard → Transfers → vind transfer bij charge → **Reverse transfer** (handmatig, volledig bedrag seller_amount).
4. **Indien application fee niet terug:**
   - Aparte fee-refund of transfer naar connected account volgens boekhoudkundige policy (juridisch/fiscaal review).
5. Verifieer webhook `charge.refunded` in Worker logs + order `payment_status = refunded` in Supabase.

**Fase 1:** geen admin refund UI in de app. Alleen Dashboard + API + dit runbook.

### Order lookup voor admin

| Bron | Veld |
|------|------|
| Supabase `orders` | `stripe_payment_intent_id`, optioneel `stripe_charge_id` |
| Stripe Dashboard | Payment → PaymentIntent → Charge |

Notifications en logs: **geen** adres, e-mail of telefoon.

---

## Testmatrix

### 1. Full refund vóór verzending

| Stap | Actie |
|------|-------|
| Setup | Betaalde order, `shipping_status = not_shipped`, stock was N na reserve/commit |
| Refund | API met `reverse_transfer=true`, `refund_application_fee=true` |
| Verwacht DB | `payment_status=refunded`, `status=refunded`, `shipping_status=not_shipped`, `refund_requires_return=false`, `stock_restored_at` gezet |
| Verwacht stock | +1 (of +qty); product weer koopbaar |
| Verwacht notifications | Seller: “… Verzend dit pakket niet.” / Buyer: “Je bestelling is terugbetaald.” |
| Ship | Seller kan **niet** meer als verzonden markeren |

### 2. Full refund ná verzending

| Stap | Actie |
|------|-------|
| Setup | Betaalde order, seller heeft `shipping_status = shipped` |
| Refund | API met correcte flags |
| Verwacht DB | `payment_status=refunded`, `status=refunded`, `shipping_status=shipped` (ongewijzigd), `refund_requires_return=true`, `stock_restored_at` **null** |
| Verwacht stock | **Geen** wijziging |
| Verwacht notifications | Seller: “… pakket staat al als verzonden; volg retour-/supportinstructies.” / Buyer: “… Neem contact op met support …” |
| Retour | Geen automatische stock; kolommen `return_*` klaar voor latere flow |

### 3. Duplicate webhook

| Stap | Actie |
|------|-------|
| Setup | Scenario 1 of 2 succesvol verwerkt |
| Actie | Replay zelfde Stripe `event.id` (Dashboard resend of test tool) |
| Verwacht | `order_payment_events` geen dubbele rij; order ongewijzigd; **geen** dubbele stock; **geen** dubbele notifications; HTTP 200 |

### 4. Pending refund

| Stap | Actie |
|------|-------|
| Setup | Betaalde order |
| Actie | Refund methode met vertraagde settlement (indien beschikbaar in testmode) |
| Verwacht | Order blijft `paid` tot `charge.refunded` (succeeded); geen premature stock restore |

### 5. Failed refund

| Stap | Actie |
|------|-------|
| Setup | Betaalde order |
| Actie | Simuleer `refund.updated` met `status=failed` (of forceer failed refund in test) |
| Verwacht | Order blijft `paid`; geen stock restore; geen refund notifications; alleen worker log / event ledger indien opgenomen |

### 6. Dashboard refund zonder reverse transfer

| Stap | Actie |
|------|-------|
| Setup | Betaalde order (testmode) |
| Actie | Full refund **alleen** via Stripe Dashboard (geen API flags) |
| Verwacht app | Webhook verwerkt order refund + notifications volgens shipping_status (scenario 1 of 2) |
| Verwacht finance | **Handmatig controleren:** seller transfer mogelijk **niet** reversed; platform balance negatief — runbook Optie B follow-up vereist |
| Document | Noteer in testlog: transfer reversal ja/nee |

### 7. API refund met reverse transfer + application fee refund

| Stap | Actie |
|------|-------|
| Setup | Betaalde order, noteer subtotal / fee / seller_amount |
| Actie | API refund met beide flags |
| Verwacht app | Zelfde als scenario 1 of 2 |
| Verwacht Stripe | Buyer refunded volledig bedrag; connected account debited seller deel; application fee refunded |

### 8. Product stock 1 vs. stock > 1

| Case | Setup | Refund vóór ship | Verwacht stock |
|------|-------|------------------|----------------|
| 8a | stock was 1 → 0 na checkout | Full refund, not shipped | stock = 1 |
| 8b | stock was 5 → 4 na checkout | Full refund, not shipped | stock = 5 |
| 8c | stock was 1, order shipped | Full refund | stock blijft 0; `refund_requires_return=true` |

---

## Deploy-volgorde (na implementatie + akkoord)

1. Migration `0037_order_full_refund_phase1.sql` (Supabase)
2. Stripe webhook: `refund.updated` toevoegen (failed detectie)
3. Worker deploy (`worker-stripe.js` + `order-refund-logic.js`)
4. Testmode: scenario’s 1, 2, 3, 7, 8a/8b verplicht; 5, 6 documenteer

**Implementatiestatus:** code lokaal klaar; migration/worker nog niet gepusht of gedeployed.

---

## Gerelateerde docs

- `docs/REFUNDS_CHARGEBACKS_AND_STOCK_PLAN.md` — volledig roadmap
- `docs/PLATFORM_FEE_AND_PAYOUTS.md` — destination charges + fee split
