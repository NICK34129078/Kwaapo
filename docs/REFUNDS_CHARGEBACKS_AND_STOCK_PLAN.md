# Refunds, chargebacks & stock restore — implementatieplan

> **Status: PLAN ONLY — geen code, migrations, deploy of Stripe-config wijzigingen.**  
> Doel: launch-ready financiële afhandeling na betaling (destination charges + 12,5% platform fee).

---

## 0. Huidige situatie (audit)

### 0.1 Betalings- & voorraadflow vandaag

| Stap | Actie | Code / RPC |
|------|-------|------------|
| 1 | Buyer start checkout | Worker `handleStripeCheckout` |
| 2 | Voorraad **afgeboekt** (reserve) | `reserve_product_stock_for_order` |
| 3 | Stripe Checkout Session | `application_fee_amount` + `transfer_data[destination]` |
| 4 | Betaling geslaagd | Webhook `checkout.session.completed` → `markOrderPaid` |
| 5 | Voorraad **committed** (lifecycle lock) | `commit_product_stock_for_order` (log + `stock_committed_at`) |
| 6 | Seller alert | Insert `seller_notifications` (`new_paid_order`) |
| 7 | Buyer ship alert | DB trigger `orders_notify_buyer_shipped` → `buyer_notifications` |

**Belangrijk:** fysieke stock wordt al bij **reserve** verlaagd. `release_product_stock_for_order` werkt **niet** na `stock_committed_at` (regel: `if ord.stock_committed_at is not null then return false`).

### 0.2 Stripe webhooks — nu ontvangen én verwerkt

| Event | Verwerking | Side effects |
|-------|------------|--------------|
| `checkout.session.completed` | `syncOrderFromStripeSession` → `markOrderPaid` | stock commit, order `paid`, seller notification |
| `checkout.session.async_payment_succeeded` | idem | idem |
| `checkout.session.expired` | `releaseStockForExpiredCheckout` | stock release, geen betaling |
| `payment_intent.payment_failed` | **Alleen log** | geen stock release |
| `account.updated` | Connect profile sync | geen order impact |
| `charge.refunded` | **Alleen log** | **geen** order/refund/stock/notifications |

Documentatie (`STRIPE_LIVE_GO_LIVE_CHECKLIST.md`) noemt ook `charge.refunded` — subscription in Dashboard moet overeenkomen; **dispute-events ontbreken volledig**.

### 0.3 Bestaande order-velden (relevant)

| Veld | Waarden | Wie mag wijzigen |
|------|---------|------------------|
| `status` | o.a. `paid`, `refunded`, `cancelled` | Seller: fulfillment; payment: **worker only** |
| `payment_status` | `unpaid`, `paid`, `failed`, `refunded` | **Worker only** (trigger) |
| `shipping_status` | `not_shipped`, `shipped`, `delivered` | Seller |
| `stock_*_at` | reserve / release / commit timestamps | **Worker / RPC only** |

Sellers **kunnen** `payment_status` niet wijzigen (`enforce_order_update_integrity`).

### 0.4 Notificaties vandaag

| Type | Types in schema | Refund/dispute |
|------|-----------------|----------------|
| Seller | `new_paid_order` only | **Geen** |
| Buyer | `order_shipped` only | **Geen** |

### 0.5 Launch gaps (samenvatting)

- Refund in Stripe Dashboard → order blijft `paid` in app/DB
- Geen stock-restore na betaalde order
- Geen buyer/seller melding bij refund/dispute
- Geen chargeback lifecycle
- Geen idempotency op financial webhooks
- Geen audit trail per Stripe refund/dispute ID

---

## 1. Aanbevolen Stripe webhook-events

### 1.1 Minimaal toevoegen aan Dashboard endpoint

| Event | Prioriteit | Reden |
|-------|------------|-------|
| `charge.refunded` | **P0** | Volledige + gedeeltelijke refunds (cumulatief op charge) |
| `refund.updated` | **P0** | Failed/pending refunds detecteren |
| `charge.dispute.created` | **P0** | Chargeback geopend |
| `charge.dispute.closed` | **P0** | Won/lost/withdrawn |
| `charge.dispute.funds_withdrawn` | P1 | Geld debited van platform (optioneel als `closed` volstaat) |
| `charge.dispute.funds_reinstated` | P1 | Dispute gewonnen — funds terug |

### 1.2 Behouden (bestaand)

`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `payment_intent.payment_failed`, `account.updated`

### 1.3 Optioneel later

| Event | Reden |
|-------|-------|
| `refund.created` | Kan redundant zijn met `charge.refunded` |
| `charge.refund.updated` | Legacy alias; prefer `refund.updated` |

---

## 2. Destination charges — refunds & transfers

Kwaapo gebruikt **destination charges** met `application_fee_amount` (zie `docs/PLATFORM_FEE_AND_PAYOUTS.md`).

Bij refund via **platform account** (Dashboard of API):

| Stripe parameter | Aanbeveling | Effect |
|------------------|-------------|--------|
| `reverse_transfer` | **`true`** (default bij Connect refunds) | Seller-deel wordt teruggehaald van connected account |
| `refund_application_fee` | **`true` bij volledige refund**; **`false` of pro-rata bij partial** (juridisch/productbesluit) | Platform fee terug naar buyer |

**Platform** initieert refunds (niet seller Express account direct op buyer charge).

Chargeback: funds withdrawn from **platform**; connected account transfer may be reversed per Stripe rules — monitor in Dashboard.

---

## 3. Datamodel (voorstel — nieuwe migration)

### 3.1 `order_payment_events` (idempotency + audit)

```sql
-- conceptueel
stripe_event_id text primary key,
order_id uuid references orders,
event_type text,          -- charge.refunded, dispute.created, ...
stripe_object_id text,    -- re_..., dp_..., ch_...
amount_cents int,
currency text default 'eur',
refund_status text null,  -- succeeded, failed, pending
dispute_status text null,
processed_at timestamptz,
payload_summary jsonb     -- geen PII/adressen
```

Worker: **INSERT … ON CONFLICT (stripe_event_id) DO NOTHING** → skip duplicate webhook processing.

### 3.2 `orders` uitbreiding (voorstel)

| Kolom | Doel |
|-------|------|
| `refunded_amount_cents` | cumulatief terugbetaald |
| `refunded_at` | eerste volledige refund timestamp |
| `refund_requires_return` | `true` wanneer refund terwijl `shipping_status` al shipped/delivered |
| `return_approved_at` | Fase 2+: retour goedgekeurd (geen UI Fase 1) |
| `returned_received_at` | Fase 2+: pakket ontvangen door seller |
| `stock_restored_at` | idempotency stock restore (refund pre-ship **of** retour-flow post-ship) |
| `stripe_charge_id` | traceability (optioneel) |

Optioneel: `payment_status` uitbreiden met `partially_refunded` **of** afleiden uit `refunded_amount < subtotal_amount`.

### 3.3 Nieuwe RPC: `restore_product_stock_for_refunded_order`

- Alleen **service_role**
- **Alleen** als `shipping_status = 'not_shipped'` — anders no-op `{ restored: false, reason: 'already_shipped_return_required' }`
- Idempotent: als `stock_restored_at` gezet → return `{ restored: false, reason: 'already_restored' }`
- Voegt quantity terug (product / variant), log `product_stock_adjustment` met reason `Terugbetaling`
- **Niet** `release_product_stock_for_order` hergebruiken (blokkeert na commit)
- Post-ship voorraad: aparte retour-RPC (Fase 2+) via `return_approved_at` / `returned_received_at`

### 3.4 Notification types uitbreiden

**Seller:** `order_refunded`, `order_dispute_opened`, `order_dispute_closed`  
**Buyer:** `order_refunded`, `order_dispute_update`  

Unique constraints: `(seller_id, order_id, notification_type)` / `(buyer_id, order_id, notification_type)` — zelfde patroon als bestaande dedup.

**Notification body:** alleen productnaam + status — **geen** adres, e-mail, telefoon.

---

## 4. Wie mag refunds starten?

| Actor | Mag refund initiëren? | Toelichting |
|-------|----------------------|-------------|
| **Platform admin** | **Ja** | Stripe Dashboard live/test of toekomstige admin API (worker + service role) |
| **Seller (in-app)** | **Nee** | Geen refund-knop; geen Stripe API vanuit seller session |
| **Buyer (in-app)** | **Nee** | Alleen support/policy flow; geen self-service refund zonder server verify |
| **Worker webhook** | **Nee** | Alleen **reageren** op Stripe events, niet initiëren |

**Regel:** geen geld terug zonder Stripe als bron van waarheid (`charge.refunded` / verified Refund object).

---

## 5. Seller UI (voorstel — geen refund-acties)

| Element | Gedrag |
|---------|--------|
| Order detail (seller) | Read-only payment status; badge “Terugbetaald” / “Dispute open” |
| Refund knop | **Afwezig** |
| Actie bij refund | Optioneel: “Neem contact op met Kwaapo support” (mailto) |
| Fulfillment na refund | Ship checklist **disabled** als `payment_status = refunded` |
| Mark shipped | Geblokkeerd als order refunded/dispute lost |

Sellers mogen **wel** shipping/tracking updaten zolang order paid en niet refunded — bestaand gedrag.

---

## 6. Scenario-tabellen

Legenda kolommen: **Stock** | **Transfer** | **Idempotency**

---

### 6.1 Volledige refund (paid, not shipped)

| | |
|--|--|
| **Stripe event** | `charge.refunded` (charge.refunded = true, amount_refunded = charge.amount) |
| **order.status** | `refunded` |
| **payment_status** | `refunded` |
| **shipping_status** | `not_shipped` (ongewijzigd) |
| **refund_requires_return** | `false` |
| **Stock** | `restore_product_stock_for_refunded_order` (+qty, één keer) |
| **Transfer** | Stripe API: `reverse_transfer=true` + `refund_application_fee=true` |
| **Buyer melding** | “Je bestelling is terugbetaald.” |
| **Seller melding** | “De bestelling is terugbetaald. Verzend dit pakket niet.” |
| **Admin** | Refund via API (aanbevolen); zie `docs/REFUNDS_PHASE1_TEST_MATRIX.md` |
| **Idempotency** | `order_payment_events.stripe_event_id`; `stock_restored_at` set once |

---

### 6.2 Volledige refund (paid, already shipped)

| | |
|--|--|
| **Stripe event** | `charge.refunded` |
| **order.status** | `refunded` |
| **payment_status** | `refunded` |
| **shipping_status** | `shipped` (historisch behouden) |
| **refund_requires_return** | `true` |
| **Stock** | **Geen** automatisch herstel — alleen via aparte retour-flow (`return_approved_at`, `returned_received_at`, `stock_restored_at`) |
| **Transfer** | reverse_transfer + refund_application_fee (API) |
| **Buyer melding** | “Je bestelling is terugbetaald. Neem contact op met support als retourinstructies nodig zijn.” |
| **Seller melding** | “De bestelling is terugbetaald. Het pakket staat al als verzonden; volg de retour-/supportinstructies.” |
| **Admin** | Refund via API + runbook; retour fysiek afhandelen buiten Fase 1 |
| **Idempotency** | idem; `stock_restored_at` blijft null tot retour-flow |

**Juridisch:** retourrecht consument B2C — apart review (§9). Zie `docs/REFUNDS_PHASE1_TEST_MATRIX.md`.

---

### 6.3 Gedeeltelijke refund

| | |
|--|--|
| **Stripe event** | `charge.refunded` (amount_refunded < charge.amount) |
| **order.status** | `paid` **of** nieuw `partially_refunded` |
| **payment_status** | `partially_refunded` (nieuw) of `paid` + `refunded_amount` kolom |
| **shipping_status** | ongewijzigd |
| **Stock** | **Geen** auto-restore tenzij business rule: partial = 0 stock (single-item shop → geen partial qty) |
| **Transfer** | Stripe partial reverse; `refund_application_fee` pro-rata (Stripe gedrag) |
| **Buyer melding** | “Deelterugbetaling ontvangen” |
| **Seller melding** | “Deelterugbetaling voor order …” |
| **Admin** | Documenteer reden (kwaliteit, shipping partial) |
| **Idempotency** | Track cumulatief `refunded_amount`; event per `stripe_event_id` |

**MVP Kwaapo:** single-item orders → partial refund **zeldzaam**; ondersteun in data model, stock restore alleen bij full refund.

---

### 6.4 Chargeback / dispute geopend

| | |
|--|--|
| **Stripe event** | `charge.dispute.created` |
| **order.status** | `paid` (frozen fulfillment) |
| **payment_status** | `paid` |
| **dispute_status** | `open` |
| **shipping_status** | **Geen nieuwe ship** if not yet shipped; if shipped → note only |
| **Stock** | **Geen** restore tot dispute closed lost |
| **Transfer** | Geen manual action; Stripe holds/f withdraws funds |
| **Buyer melding** | **Optioneel none** (dispute is bank flow) |
| **Seller melding** | `order_dispute_opened` — “Er is een betalingsgeschil; wacht op afhandeling.” |
| **Admin** | Submit evidence in Stripe Dashboard; monitor deadline |
| **Idempotency** | `order_payment_events` per dispute id |

---

### 6.5 Chargeback verloren (dispute lost)

| | |
|--|--|
| **Stripe event** | `charge.dispute.closed` (status=lost) |
| **order.status** | `refunded` (treated as chargeback refund) |
| **payment_status** | `refunded` |
| **dispute_status** | `lost` |
| **Stock** | Zelfde regel als full refund (restore if not consumed) |
| **Transfer** | Already reversed via dispute flow |
| **Buyer melding** | none / generic |
| **Seller melding** | `order_dispute_closed` — “Geschil afgerond.” |
| **Admin** | Review platform loss vs seller; boekhouding |
| **Idempotency** | idem |

---

### 6.6 Chargeback gewonnen (dispute won)

| | |
|--|--|
| **Stripe event** | `charge.dispute.closed` (status=won) + optional `charge.dispute.funds_reinstated` |
| **order.status** | `paid` (restore) |
| **payment_status** | `paid` |
| **dispute_status** | `won` |
| **Stock** | Geen wijziging (stock was never restored) |
| **Transfer** | Funds reinstated to platform/seller per Stripe |
| **Buyer melding** | none |
| **Seller melding** | `order_dispute_closed` — “Geschil gewonnen.” |
| **Admin** | Verify balance in Dashboard |
| **Idempotency** | idem |

---

### 6.7 Chargeback reversal / funds reinstated (mid-flight)

| | |
|--|--|
| **Stripe event** | `charge.dispute.funds_reinstated` |
| **order.status** | `paid` if was disputed |
| **payment_status** | `paid` |
| **dispute_status** | update toward `won` |
| **Stock** | none |
| **Transfer** | Stripe automatic |
| **Buyer/Seller melding** | optional admin-only |
| **Admin** | Reconcile |
| **Idempotency** | per event id |

---

### 6.8 Failed refund

| | |
|--|--|
| **Stripe event** | `refund.updated` (status=failed) |
| **order.status** | unchanged (`paid`) |
| **payment_status** | unchanged |
| **Stock** | **Geen** restore (refund never succeeded) |
| **Transfer** | none |
| **Buyer melding** | none (support handles) |
| **Seller melding** | none |
| **Admin** | Alert/log; retry refund in Stripe |
| **Idempotency** | event id |

---

### 6.9 Duplicate webhook delivery

| | |
|--|--|
| **Stripe event** | Any (same `event.id`) |
| **All order fields** | **Geen wijziging** |
| **Stock** | **Geen** second restore |
| **Idempotency** | **`order_payment_events.stripe_event_id` UNIQUE** — handler returns 200 early |

---

## 7. Implementatiefases (voorstel)

| Fase | Scope | Launch blocker? |
|------|-------|-----------------|
| **F1** | Migration: `order_payment_events`, `restore_product_stock_for_refunded_order`, order kolommen | Ja |
| **F2** | Worker: `charge.refunded` handler (full refund path) | Ja |
| **F3** | Worker: `refund.updated` failed | Ja |
| **F4** | Notifications buyer/seller refund | Ja (internal TestFlight) |
| **F5** | Dispute handlers | Ja vóór live volume |
| **F6** | Partial refund + admin tooling | Kan post-MVP |
| **F7** | In-app admin refund API (optional) | Post-MVP |

---

## 8. Worker handler outline (concept)

```
handleStripeWebhook:
  on charge.refunded:
    1. idempotency insert event
    2. resolve order_id from payment_intent metadata
    3. fetch charge from Stripe API (verify amounts — never trust body alone)
    4. if full refund → patch order refunded + restore stock RPC
    5. insert buyer/seller notifications (dedup)
  on refund.updated (failed):
    log + admin alert
  on charge.dispute.created / closed:
    update dispute_status + notifications
    if lost → treat like refund path for stock (policy)
```

**Geen** refund amounts in console logs met buyer PII.

---

## 9. Juridisch / boekhoudkundig — aparte review vereist

| Onderwerp | Waarom review |
|-----------|---------------|
| Consumentenherroeping (14 dagen) | Refund timing vs shipped goods |
| BTW op platform fee na refund | Partial/full refund effect op 12,5% omzet |
| `refund_application_fee` policy | Wanneer platform fee teruggeven aan buyer |
| Chargeback verlies | Wie draagt finaal verlies (platform vs seller contract) |
| Boekhouding Stripe balance vs mutaties | Export naar accountant |
| Seller terms | Dispute/refund verplichtingen in `seller` policy |

Dit plan is **geen** juridisch of fiscaal advies.

---

## 10. Testplan (testmode, vóór live)

1. €20 test order → pay → verify paid + stock committed  
2. Stripe Dashboard → **full refund** with reverse transfer + refund application fee  
3. Verify: webhook → order `refunded`, stock +1, notifications inserted once  
4. Replay same webhook → **no** double stock  
5. Partial refund €5 on €20 → order partial state, stock unchanged  
6. Simulate dispute (Stripe test card) → dispute handlers update status  
7. Seller app: **no** refund button; status displays correctly  

---

## 11. Gerelateerde docs

- `docs/PLATFORM_FEE_AND_PAYOUTS.md` — destination charges + fee split  
- `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md` — webhook subscription  
- `supabase/orders_payment_integrity_guard_RUN_IN_DASHBOARD.sql` — seller payment lock  
- `supabase/product_variant_stock_reservation_RUN_IN_DASHBOARD.sql` — stock lifecycle  

---

## 12. Samenvatting antwoorden op onderzoeksvragen

| # | Vraag | Antwoord |
|---|-------|----------|
| 1 | Webhooks nu | 6 types; alleen checkout + connect + log refund |
| 2 | Events nodig | + `refund.updated`, `charge.dispute.*` (zie §1) |
| 3 | Status per scenario | §6 tabellen |
| 4 | Duplicate webhooks | `order_payment_events` + `stock_restored_at` |
| 5 | Transfer reversal | Stripe `reverse_transfer` on refund; platform initiates |
| 6 | Wie start refund | **Platform/admin only** |
| 7 | Seller UI | Read-only; geen refund acties |
