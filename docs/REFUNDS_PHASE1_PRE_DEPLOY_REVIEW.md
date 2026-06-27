# Fase 1 refunds — pre-deploy review (migrations 0034 → 0037)

> **Status:** review only — geen deploy uitgevoerd.  
> **P1 fix:** event-ledger insert verplaatst naar einde van `apply_full_order_refund`; stock-failure → `RAISE EXCEPTION` (volledige rollback).  
> **Volgorde:** `0034` → `0035` → `0036` → `0037` → worker deploy → Stripe webhook events.

---

## Executive summary

| Onderwerp | Oordeel |
|-----------|---------|
| 0037 op bestaande prod-data (schema) | **Veilig** — additive columns, geen backfill verplicht |
| Bestaande paid/shipped/delivered orders | **Onaangeroerd** tot eerste refund-webhook |
| Shipped refund → geen stock restore | **Correct** |
| Pre-ship refund atomiciteit | **Opgelost (P1)** — rollback bij stock-failure; event pas na succes |
| Stripe retry na mislukte poging | **Ondersteund** — worker HTTP 500 bij retriable RPC-fout |
| Worker dubbele refund-webhook | **Veilig** — idempotent |
| `stripe_charge_id` bestaande orders | **Gap** — geen backfill; alleen nieuwe betalingen + webhook fill |
| Statuskolom event-ledger | **Niet nodig** — insert-at-end volstaat (zie §3) |

**Aanbeveling vóór eerste echte refund:** migration 0034–0037 deployen, worker deployen, webhook events aanvullen, testmode E2E.

---

## 1. Draait 0037 veilig op productie met bestaande orders?

**Ja, voor schema-migratie.**

0037 is volledig **additief**:

- Nieuwe tabel `order_payment_events` (leeg na deploy).
- Nieuwe nullable kolommen op `orders`.
- `refund_requires_return boolean NOT NULL DEFAULT false`.

**Bestaande orders** worden niet gewijzigd door 0037 zelf.

**Afhankelijkheden:** 0034 (`seller_notifications`), 0036 (`buyer_notifications`) vóór 0037.

**Edge case:** paid orders zonder `stock_committed_at` → pre-ship refund faalt met exception, order blijft `paid`, Stripe retry tot handmatige fix.

---

## 2. Kunnen NOT NULL, checks, triggers of RPC’s bestaande data blokkeren?

| Wijziging | Impact |
|-----------|--------|
| `refund_requires_return NOT NULL DEFAULT false` | Geen blokkade |
| Notification CHECK uitbreiden | Alleen nieuwe `order_refunded` inserts |
| `enforce_order_update_integrity` replace | Strenger voor sellers; geen impact op bestaande rijen |
| RPC’s | Geen automatische aanroep op deploy |

**Conclusie:** deploy wijzigt geen bestaande orderrijen.

---

## 3. Is `apply_full_order_refund(...)` atomair bij stock-restore-falen?

### Antwoord: **Ja, na P1-fix.**

**Eén PostgREST RPC-call = één PostgreSQL-transactie.**

Volgorde binnen `apply_full_order_refund`:

1. **SELECT** duplicate check (`order_payment_events`) — geen write
2. Order **`FOR UPDATE`**
3. Validaties (early RETURN zonder writes bij skip: `not_paid`, `not_full_refund`, …)
4. **Pre-ship:** `restore_product_stock_for_refunded_order` → bij falen **`RAISE EXCEPTION`** → **volledige rollback**
5. **`UPDATE orders`** → `refunded`
6. **`INSERT order_payment_events`** — alleen na stap 4–5 geslaagd

### Pre-ship stock restore faalt

| Effect | Uitkomst |
|--------|----------|
| Event-ledger | **Geen rij** (rollback) |
| Order | Blijft **`paid`** |
| Stock / `stock_restored_at` | **Ongewijzigd** |
| Notifications | **Geen** (worker krijgt error vóór send) |
| Stripe retry | **Ja** — worker returnt **HTTP 500** |

### Post-ship (`shipped` / `delivered`)

Geen stock restore → order UPDATE + event INSERT in dezelfde transactie → atomair.

### Statuskolom nodig?

**Nee.** Onderscheid received/processed wordt bereikt door:

- **Geen rij** = nooit succesvol verwerkt (retry OK)
- **Rij aanwezig** = processed (duplicate → HTTP 200, geen side effects)

Audit van mislukte pogingen: Worker logs + Stripe Dashboard (geen PII).

---

## 4. Refund na `shipped` / `delivered`

**Ja.**

```sql
v_requires_return := shipping_status in ('shipped', 'delivered');
```

- Geen stock restore
- `refund_requires_return = true`
- Event insert na succesvolle order UPDATE

---

## 5. Seller-notification shipped-refund

Post-ship tekst erkent verzonden status en wijst naar retour/support — **geen undo-suggestie**.

Pre-ship: “Verzend dit pakket niet.” — alleen bij `refund_requires_return = false`.

---

## 6. `stripe_charge_id`

| Scenario | Gedrag |
|----------|--------|
| Nieuwe betalingen | Opslag via PI expand in `markOrderPaid` |
| Bestaande paid orders | Geen backfill; `stripe_payment_intent_id` blijft fallback |
| Refund-webhook | Vult `stripe_charge_id` aan indien leeg |

---

## 7. Worker bij `charge.refunded` voor al refunded order

| Laag | Gedrag |
|------|--------|
| Event bestaat | `{ duplicate: true }` → geen notifications |
| Order al refunded, event nieuw | Event insert (note `order_already_refunded`) → duplicate |
| Succes + retry | Geen dubbele stock/notifications |

---

## 8. Stripe webhook-events

### Aanvinken

| Event | Actie |
|-------|-------|
| `checkout.session.completed` | Mark paid |
| `checkout.session.async_payment_succeeded` | Mark paid |
| `checkout.session.expired` | Release stock |
| `payment_intent.payment_failed` | Log |
| `account.updated` | Connect sync |
| **`charge.refunded`** | Full refund flow |
| **`refund.updated`** | Log bij `failed` |

### Niet aanvinken (Fase 1)

`refund.created`, `charge.dispute.*`, redundante PI-events.

Eén endpoint; test/live elk eigen signing secret.

---

## P1 fix — samenvatting

| Vóór | Na |
|------|-----|
| Event INSERT vóór stock restore | Event INSERT **na** order UPDATE |
| Early RETURN bij stock fail → event blijft | `RAISE EXCEPTION` → rollback |
| Stripe retry geblokkeerd | Retry werkt (500 response) |

**Tests:** `node order-refund-atomic.test.mjs` — failure → retry → single stock + notifications.

---

## Deploy-checklist (nog niet uitvoeren)

- [ ] Backup prod database
- [ ] Migrations 0034 → 0035 → 0036 → 0037
- [ ] Worker deploy
- [ ] Stripe: `refund.updated` toevoegen
- [ ] Testmode E2E (geen live refund tot groen)

---

## Gerelateerde docs

- `docs/REFUNDS_PHASE1_TEST_MATRIX.md`
- `docs/REFUNDS_CHARGEBACKS_AND_STOCK_PLAN.md`
- `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md`
