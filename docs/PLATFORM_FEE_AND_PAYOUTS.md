# Platform fee (12,5%) & payouts — Kwaapo

> Technische audit van de bestaande Stripe Connect checkout-flow.  
> **Geen belasting-, BTW- of boekhoudadvies** — laat dat apart controleren door een accountant/fiscalist.

---

## Architectuur in één zin

Kwaapo gebruikt **Stripe Connect Express** met **destination charges**: de betaling loopt via jouw **platform-Stripe-account**, 12,5% gaat als **`application_fee_amount`** naar jouw platformsaldo, en het resterende bedrag wordt **doorgestort naar de connected seller**.

Code-referentie: `worker-stripe.js` → `handleStripeCheckout` (Checkout Session + `payment_intent_data`).

---

## 1. Welk charge-model?

| Model | Gebruikt? |
|-------|-----------|
| **Destination charges** | **Ja** |
| Direct charges | Nee |
| Separate charges and transfers | Nee |

Bewijs in code (`worker-stripe.js`):

```javascript
"payment_intent_data[application_fee_amount]": String(feeCents),
"payment_intent_data[transfer_data][destination]": destinationAccountId,
```

De Checkout Session wordt aangemaakt op het **platform-account** (`sk_...` secret key). Er is geen `on_behalf_of` direct charge op het connected account.

Connected accounts: **`type: "express"`** (`worker-stripe-connect.js` → `createConnectAccount`).

---

## 2. Waar wordt 12,5% ingesteld?

| Mechanisme | Gebruikt? | Locatie |
|------------|-----------|---------|
| **`application_fee_amount`** | **Ja** | Worker bij Stripe Checkout Session |
| Handmatig transfer amount | Nee (Stripe berekent transfer = charge − application fee) | — |
| Stripe Platform Pricing Tool | Nee | — |
| Alleen metadata | Deels | `metadata[platform_fee_rate]=0.125` (audit trail, geen billing) |

### Fee-berekening

| Laag | Rate | Functie |
|------|------|---------|
| Worker (authoritative bij checkout) | `PLATFORM_FEE_RATE = 0.125` | `applicationFeeCents(subtotalCents)` |
| Worker (DB sync) | 0.125 | `computePlatformFeeAmount(subtotal)` |
| App (order aanmaken) | 0.125 | `src/constants/platformFee.ts` |

Worker-cap: minimaal **1 cent** blijft voor de seller (`feeCents` max = `subtotalCents - 1`).

Vóór Stripe-aanroep valideert de worker prijs/voorraad opnieuw tegen de **live product-DB** en sync’t `subtotal_amount`, `platform_fee_amount`, `seller_amount` indien nodig.

---

## 3. Voorbeeld: order €100,00

Aannames: enkel orderregel, quantity 1, prijs €100,00, betaald via Stripe Checkout, seller Connect-ready.

| Regel | Bedrag | Wie |
|-------|--------|-----|
| Buyer betaalt | **€100,00** | Klant |
| Platform fee (12,5%) | **€12,50** | Jouw Stripe **platform balance** (application fee) |
| Seller transfer | **€87,50** | Connected Express account (automatische transfer) |

### Stripe processing fees (indicatief)

Bij **destination charges** betaalt het **platform** de Stripe-verwerkingskosten over de **volledige charge** (Stripe-documentatie: platform is responsible for Stripe fees on destination charges).

Voorbeeld EU kaart (indicatief, check jouw Stripe-tarief):

- ~1,5% + €0,25 over €100 ≈ **€1,75**

→ **Bruto platform fee:** €12,50  
→ **Minus Stripe fee (indicatief):** ~€1,75  
→ **Indicatief netto vóór belasting:** ~**€10,75**

iDEAL/other methoden: ander tarief — altijd in Stripe Dashboard per payment bekijken.

### Refunds

- Refund gebeurt vandaag **handmatig in Stripe Dashboard** (geen in-app refund-flow).
- Webhook `charge.refunded`: **alleen logging** in `worker-stripe.js` — order wordt **niet** automatisch op `refunded` gezet.
- Bij refund van destination charge: Stripe kan application fee terugdraaien (`refund_application_fee`) en transfer reversal — afhankelijk van refund-opties in Dashboard. **Niet geautomatiseerd in code.**

### Chargebacks / disputes

- Bij destination charges: **platform** draagt chargeback-risico en dispute-kosten (Stripe Connect model).
- Geen dispute-handler in app-code.

---

## 4. Bevestiging: fee gaat niet naar seller

**Ja — correct geïmplementeerd**, mits checkout via `handleStripeCheckout` loopt:

1. Seller moet Connect-ready zijn (`isSellerReadyForDestinationCharge`) — anders **geen** session.
2. Elke session zet **beide**:
   - `application_fee_amount` = 12,5% (in centen)
   - `transfer_data[destination]` = seller `stripe_connect_account_id`
3. Seller ontvangt **niet** 100%: transfer = charge − application fee (Stripe standaard).

De 12,5% komt op het **platform Stripe-saldo** (application fee balance), niet op het connected account.

DB-kolommen `platform_fee_amount` / `seller_amount` zijn ter **weergave/audit**; Stripe split wordt bepaald door `application_fee_amount` op de PaymentIntent.

---

## 5. Risico-audit — ontbrekende of zwakke punten

| Risico | Status | Toelichting |
|--------|--------|-------------|
| Application fee niet gezet | **Laag** | Altijd gezet in checkout params; seller-not-ready blokkeert checkout |
| Seller ontvangt per ongeluk 100% | **Laag** | Zonder `application_fee_amount` zou transfer volledig zijn — code zet fee altijd |
| Verkeerde fee-berekening | **Laag** | Worker herberekent van DB-prijs; cap op micro-bedragen |
| Client vs worker fee mismatch | **Zeer laag** | Worker overschrijft DB vóór Stripe; alleen UI-label op client order |
| Refund fee niet teruggedraaid | **Medium** | Geen automatisering; afhankelijk van Stripe refund settings + handmatige actie |
| Chargeback volledig op platform | **Ja (by design)** | Destination charge model — geen mitigatie in code |
| `charge.refunded` → order status | **Gap** | Alleen console log; Supabase order blijft `paid` |
| Stripe Dashboard refund zonder stock restore | **Medium** | Geen gekoppelde voorraad-logica bij refund webhook |

Geen code-wijzigingen in deze audit — wel aanbevolen vóór live: één testmode refund + charge inspectie in Dashboard.

---

## 6. Jouw platform bankrekening koppelen

1. Log in op [Stripe Dashboard](https://dashboard.stripe.com) (platform account, niet seller Express).
2. **Settings → Business → Bank accounts and scheduling** (of **Payouts**).
3. Voeg **IBAN** toe voor je bedrijfsentiteit (KVK/BTW-gegevens moeten compleet zijn).
4. Voltooi **account activation** (identity + business verification).

Application fees van Connect landen op je **platform balance**; payouts naar jouw bank volgen je **platform payout schedule**.

---

## 7. Waar zie je wat in Stripe?

| Wat | Dashboard pad |
|-----|----------------|
| **Platform saldo** | **Home → Balances** (platform account) |
| **Application fees per betaling** | **Payments** → klik payment → sectie **Connect** / application fee |
| **Transfers naar sellers** | **Connect → Transfers** |
| **Jouw payout schedule** | **Settings → Payouts** (platform) |
| **Connected seller accounts** | **Connect → Accounts** |
| **Webhook events** | **Developers → Webhooks** → `?stripeWebhook=1` endpoint |
| **Test vs live** | Toggle linksboven (Test mode) |

---

## 8. Seller bankrekening koppelen

Sellers doen dit **niet** in Kwaapo/Supabase:

1. Profile → **Verkoopaccount** / seller onboarding.
2. App opent **Stripe Connect Hosted Onboarding** (Express).
3. Seller vult KYC + **eigen bankrekening** in bij Stripe.
4. Status via `?stripeConnectStatus=1` + webhook `account.updated`.
5. **Uitbetalingsrekening wijzigen:** in-app **“Uitbetalingsrekening beheren”** → Stripe Express Dashboard link.

Geen IBAN in `profiles` — correct.

---

## 9. Dashboard-checklist vóór livegang

- [ ] Platform account fully activated (live mode)
- [ ] Connect Express enabled
- [ ] Live webhook naar worker met events: `checkout.session.completed`, `account.updated`, `charge.refunded`
- [ ] Worker secrets: `STRIPE_SECRET_KEY` = `sk_live_...`, `STRIPE_WEBHOOK_SECRET` live
- [ ] Test seller: `stripe_charges_enabled` + `stripe_payouts_enabled` = true
- [ ] Eén live testbetaling: application fee 12,5% zichtbaar op platform payment
- [ ] Transfer 87,5% (van €100) zichtbaar naar connected account
- [ ] Platform bankrekening + payout schedule ingesteld

---

## 10. Test met €1,00 (testmode)

1. Product €1,00, verified seller, buyer checkout.
2. Kaart `4242 4242 4242 4242` (testmode).
3. Controleer in Stripe **Payments**:
   - Amount €1,00
   - Application fee **€0,13** (12,5% afgerond; worker cap laat min. 1 cent naar seller → fee max €0,99)
   - Transfer naar seller **€0,87** (bij exact €1,00: fee 12,5 cent → afgerond 13 cent, seller 87 cent)
4. Controleer Supabase `orders`: `payment_status=paid`, `platform_fee_amount` / `seller_amount`.
5. Optioneel: partial refund in Dashboard → bekijk application fee reversal.

**Let op:** bij zeer kleine bedragen wijkt cent-afronding af — test ook minimaal één **€20–€100** order.

---

## 11. Belasting / BTW / boekhouding

- Platform fee is **omzet** voor jouw onderneming — BTW/fiscale behandeling hangt af van je structuur en seller-model.
- Seller ontvangt bruto transfer — eigen fiscale verplichtingen.
- Stripe fees zijn **kosten** op platformniveau.
- **Laat dit nalopen met een accountant** — deze doc is geen fiscaal advies.

---

## 12. Code-referenties

| Onderdeel | Bestand |
|-----------|---------|
| Checkout + fee + destination | `worker-stripe.js` |
| Fee constants (app) | `src/constants/platformFee.ts` |
| Order insert (fee kolommen) | `src/services/ordersService.ts` |
| Connect Express create | `worker-stripe-connect.js` |
| Seller readiness guard | `worker-seller-readiness.js` |
| Payment integrity (sellers can't edit fees) | `supabase/orders_payment_integrity_guard_RUN_IN_DASHBOARD.sql` |
| Live checklist | `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md` |
