# Stripe Connect live go-live checklist (Kwaapo)

Gebruik deze checklist om van **testmode** naar **live** te gaan zonder aparte codebases. Alleen Worker-secrets en Stripe-dashboardconfiguratie wijzigen.

## Architectuur (kort)

- **Account type:** Stripe Connect **Express**
- **Betalingen:** destination charges + `application_fee_amount` (12,5% platform)
- **Bank/IBAN/KYC:** alleen via Stripe Hosted Onboarding / Express Dashboard — **nooit** in Supabase
- **Status:** `evaluateSellerPayoutReadiness` op de Worker (Stripe API + `account.updated` webhook)

## 1. Stripe live account

- [ ] Stripe-account volledig geactiveerd (live mode)
- [ ] Connect ingeschakeld voor Express accounts
- [ ] Live **publishable** key alleen waar nodig (app gebruikt geen secret keys)

## 2. Worker secrets (productie)

Zet via `npx wrangler secret put <NAME>`:

| Secret | Live waarde |
|--------|-------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (live endpoint) |
| `SUPABASE_URL` | productie Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | productie service role |
| `KVK_API_KEY` | live KVK API key |
| `KVK_API_BASE` | `https://api.kvk.nl/api/v1` (optioneel) |
| `WORKER_PUBLIC_URL` | `https://<jouw-worker>.workers.dev` |

Verwijder/vervang **geen** test keys in de app — die staan niet in de app bundle.

## 3. Live webhook endpoint

In Stripe Dashboard → Developers → Webhooks (live mode):

- **URL:** `https://<jouw-worker>.workers.dev?stripeWebhook=1`
- **Events minimaal:**
  - `account.updated`
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.expired`
  - `payment_intent.payment_failed`
  - `charge.refunded` (logging)

Kopieer het **signing secret** naar `STRIPE_WEBHOOK_SECRET`.

## 4. Database migraties

Voer uit op productie Supabase:

- `0020_seller_onboarding.sql` (indien nog niet)
- `0021_kvk_verification.sql`
- `0027_stripe_connect_status_fields.sql`

```bash
npm run supabase:push
```

## 5. Worker deploy

```bash
npm run deploy:worker
```

## 6. Test seller (live, klein bedrag)

1. Maak een **business** Kwaapo-account
2. Vul KVK + bedrijfsgegevens in (KVK API moet slagen)
3. Doorloop Stripe **live** onboarding (echte bankgegevens)
4. Controleer in app: status **“Je verkoopaccount is actief”**
5. Controleer Supabase `profiles`:
   - `seller_onboarding_status = verified`
   - `stripe_charges_enabled = true`
   - `stripe_payouts_enabled = true`
   - `kvk_verified_at` ingevuld

## 7. Eerste live aankoop

- [ ] Checkout naar verified seller → slaagt
- [ ] Order `payment_status = paid` na webhook
- [ ] Platform fee ~12,5% in Stripe dashboard
- [ ] Transfer naar connected account zichtbaar

## 8. Refund test

- [ ] Refund in Stripe dashboard
- [ ] `charge.refunded` komt binnen in Worker logs

## 9. Payout / rekening wijzigen

- [ ] Seller tikt **“Uitbetalingsrekening beheren”**
- [ ] Stripe Express dashboard / onboarding opent
- [ ] Na terugkeer: `?stripeConnectStatus=1` of `account.updated` werkt
- [ ] Geen IBAN in `profiles`

## 10. Negatieve tests

- [ ] Seller zonder Stripe → checkout geblokkeerd: *“Deze verkoper kan momenteel nog geen betalingen ontvangen.”*
- [ ] Product toevoegen geblokkeerd zonder `verified`
- [ ] Stripe requirements open → status terug naar `pending_review`, niet `verified`

## Testmode vs live

| | Test | Live |
|---|------|------|
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |
| Webhook secret | test endpoint | live endpoint |
| Onboarding | test banknummers | echte gegevens |
| KVK | test API URL/key mogelijk | productie KVK key |

**Geen code wijziging nodig** — alleen secrets en Stripe dashboard.
