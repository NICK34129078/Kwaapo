# App Store Connect submission checklist — Kwaapo

> Vul placeholders `[INVULLEN]` in vóór submission. Juridische teksten zijn **niet** geverifieerd door een advocaat.

## A. Metadata (App Store Connect)

| Veld | Waarde / actie |
|------|----------------|
| App naam | **Kwaapo** |
| Subtitle | `[INVULLEN — bijv. Fashion reels & marketplace]` |
| Description | `[INVULLEN — beschrijf reels, shop, verified sellers, geen digitale IAP]` |
| Keywords | fashion, reels, shop, marketplace, `[INVULLEN]` |
| Support URL | `[INVULLEN: https://jouwdomein.nl/support]` |
| Marketing URL | `[OPTIONEEL]` |
| Privacy Policy URL | **Verplicht** — zelfde inhoud als in-app policy. Zet live vóór review: `[INVULLEN]` |
| Primary category | Shopping of Social Networking |
| Secondary category | `[INVULLEN]` |
| Age rating | 12+ of 17+ (UGC + marketplace — bevestig in questionnaire) |
| Copyright | `[INVULLEN: © 2026 Bedrijfsnaam]` |
| Screenshots | iPhone 6.7", 6.5", 5.5" — reels, shop, product, checkout, profile settings met policies |
| App preview | Optioneel |
| Contact | `[INVULLEN: naam, e-mail, telefoon]` |

## B. Privacy Nutrition Label (inventory uit codebase)

Bevestig zelf in App Store Connect — onderstaande is gebaseerd op **werkelijke** app-services:

| Data type | Waarom | Gedeeld met | Linked to user | Tracking | Bron |
|-----------|--------|-------------|----------------|----------|------|
| Naam | Account, orders | Supabase, Stripe | Ja | Nee | Auth, checkout |
| E-mail | Account, orders, support | Supabase, Stripe | Ja | Nee | Supabase Auth |
| User ID | App-functies | Supabase | Ja | Nee | UUID profiles |
| Username | Profiel, social | Supabase | Ja | Nee | profiles |
| Foto/video | UGC reels, producten | Supabase, Cloudflare R2 | Ja | Nee | uploads |
| Purchase history | Orders | Supabase, Stripe | Ja | Nee | orders |
| Financial info | Betaling | Stripe (niet in app DB) | Ja | Nee | Stripe Checkout |
| Shipping address | Fysieke orders | Supabase (orders) | Ja | Nee | checkout |
| Contact info | Checkout telefoon | Supabase | Ja | Nee | orders |
| User content | Posts, captions, listings | Supabase, R2 | Ja | Nee | posts, products |
| Diagnostics | Foutopsporing | `[INVULLEN indien Expo/Sentry actief]` | Mogelijk | Nee | console/logs |
| Identifiers | Device/session | Expo | `[BEVESTIG]` | Nee | Expo |

**Niet in app (geen label nodig):** locatie GPS, contactenlijst, browsing history (tenzij later toegevoegd).

## C. App Review Notes (template)

```
Kwaapo is a social fashion reels app with a peer-to-peer marketplace for physical goods.

PHYSICAL GOODS ONLY — Stripe Checkout is used for physical product purchases between users.
No digital in-app purchases or consumables.

DEMO ACCOUNTS
Buyer account:
Email: [INVULLEN]
Password: [INVULLEN]

Seller account (verified business + Stripe test/live):
Email: [INVULLEN]
Password: [INVULLEN]

HOW TO TEST BUYING
1. Log in as buyer
2. Tab Shop → open a product → Koop nu
3. Enter shipping info → Stripe Checkout (test card 4242… in test mode)
4. Return to app → Mijn bestellingen

HOW TO TEST SELLING
1. Log in as seller → Profile → Instellingen → Verkoopaccount
2. My Shop → orders with "Actie vereist" after paid order
3. Mark shipped with checklist

MODERATION
- Reels: ⋯ menu → Melden / Blokkeer
- Products: flag icon on product detail → Rapporteer product
- Reports stored in Supabase moderation_reports + post_reports

ACCOUNT DELETION
Profile → Settings (gear) → Account verwijderen

POLICIES
Profile → Settings → Juridisch & privacy (Privacy, Terms, Community Guidelines, Marketplace)

BACKEND (must stay live during review)
- Supabase: [INVULLEN project URL]
- Cloudflare Worker: [INVULLEN workers.dev URL]
- Stripe webhooks: ?stripeWebhook=1

Push notifications: NOT enabled in this build.
```

## D. TestFlight checklist

- [ ] Fresh install op iPhone (laatste iOS)
- [ ] Upgrade install van vorige build
- [ ] Registratie + login + wachtwoord reset
- [ ] Video upload + playback reels
- [ ] Follow / like / report / block
- [ ] Product listing (seller) + prohibited word blocked client-side
- [ ] Seller onboarding + terms accept
- [ ] Stripe checkout + cancel (stock returns)
- [ ] Seller fulfillment + buyer "Onderweg" status
- [ ] Account deletion flow + logout
- [ ] Privacy links open in-app
- [ ] Support mailto werkt
- [ ] Offline: feed retry, checkout error message
- [ ] Deep link shared post
- [ ] Geen placeholder settings items zichtbaar

## E. Pre-submission technical (handmatig)

- [ ] Run `supabase db push` — migration **0036_prelaunch_compliance.sql**
- [ ] Run `npm run deploy:worker` (stock release + Stripe)
- [ ] Vul `SUPPORT_EMAIL` en `PRIVACY_POLICY_WEB_URL` in `src/constants/appPolicies.ts`
- [ ] Publiceer privacy policy op web URL
- [ ] Maak demo buyer + seller accounts in productie/test
- [ ] Worker debug endpoints verwijderd (`?debugEnv=1`, `?stripeConnectDebug=1`) — **done in worker.js**
- [ ] Juridische review policies — **menselijke taak**

## F. Known rejection risks

| Risiek | Status |
|--------|--------|
| Geen account deletion | **Fixed** — AccountDeletionScreen |
| Geen privacy policy URL | **Deels** — in-app ja; web URL `[INVULLEN]` |
| Placeholder settings | **Fixed** — stubs verwijderd |
| Fake push toggle | **Fixed** — verwijderd |
| UGC zonder report | **Deels** — posts + products; geen comment reports |
| IAP vs physical goods | Documenteer in review notes |
| Sign in with Apple | **Alleen e-mail login** — documenteer; Apple vereist Apple Sign In als *andere* social login bestaat — controleer of alleen email voldoet |
