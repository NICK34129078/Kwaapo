# Kwaapo staging checkout — testomgeving

Staging is **gescheiden** van productie. Geen productie-push, geen production Worker deploy.

## Resources

| Resource | Waarde |
|----------|--------|
| Supabase project | `kwaapo-staging-checkout` |
| Project ref | `fvdhokrxcdpnenyjzwqi` |
| Supabase URL | `https://fvdhokrxcdpnenyjzwqi.supabase.co` |
| Cloudflare Worker | `kwaapo-staging-checkout` |
| Worker URL | `https://kwaapo-staging-checkout.n-vandullemen.workers.dev` |
| Health | `GET ?health=1` → `{"ok":true}` |
| Stripe webhook (test) | `POST ?stripeWebhook=1` |

## Productie (ongewijzigd)

| Resource | Status |
|----------|--------|
| Supabase `socialV2` (`mvngamvkdtcprgiizcvk`) | Migration **0043 nog niet gepusht** |
| Worker `wild-mountain-072a` | **Niet gedeployed** met reconciliation |

## Dashboard-acties (jij)

1. **Stripe Dashboard (testmode)**  
   - Developers → Webhooks → Add endpoint  
   - URL: `https://kwaapo-staging-checkout.n-vandullemen.workers.dev?stripeWebhook=1`  
   - Events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `refund.updated`  
   - Kopieer `whsec_...` (staging-only)

2. **Stripe test API key**  
   - Developers → API keys → `sk_test_...`  
   - **Geen** `sk_live_` op staging Worker

3. **Worker secrets (staging)**  
   ```powershell
   echo "sk_test_..." | npx wrangler secret put STRIPE_SECRET_KEY --config wrangler.staging.jsonc
   echo "whsec_..." | npx wrangler secret put STRIPE_WEBHOOK_SECRET --config wrangler.staging.jsonc
   ```

4. **Supabase Auth redirects (staging project)**  
   - `kwaapo://checkout/success`  
   - `kwaapo://checkout/cancel`  
   - `kwaapo://**`

5. **App preview build**  
   - Kopieer `.env.staging.example` → `.env.staging`  
   - Vul staging anon key + `EXPO_PUBLIC_KWAAPO_WORKER_BASE`  
   - Start: `npx expo start` met env geladen (niet `.env` productie overschrijven)

## Deploy staging Worker

```powershell
npx wrangler deploy --config wrangler.staging.jsonc
```

## Migration 0043 op staging

Checkout-kritieke schema is handmatig toegepast (0033, 0034, 0037, 0043) vanwege feed-migration volgorde op greenfield DB.  
Verifieer: `reconcile_product_stock_for_paid_order`, `fulfillment_status` kolom.

## Late webhook test (zelfde order + session)

1. Start checkout in app (staging env) → noteer `order_id`, `cs_...`
2. Trigger `checkout.session.expired` (wacht 30 min of Stripe CLI)
3. Controleer `stock_released_at`
4. Voltooi betaling / trigger `checkout.session.completed`
5. Verifieer `fulfillment_status` = `reconciled` of `stock_unavailable` + refund

## Stripe CLI (optioneel)

```bash
stripe listen --forward-to "https://kwaapo-staging-checkout.n-vandullemen.workers.dev?stripeWebhook=1"
stripe trigger checkout.session.completed
```
