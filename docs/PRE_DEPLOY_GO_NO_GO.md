# Pre-deploy go / no-go checklist

Vink **alles** af vóór migrations (0034 → 0035 → 0036) en worker deploy (JWT).

> **Geen worker deployen voordat de backup is gemaakt.**  
> **Geen migration uitvoeren zonder volgorde 0034 → 0035 → 0036 te controleren.**  
> **Geen App Store submission voordat privacy policy URL, support contact en E2E-test zijn afgerond.**  
> **Geen fallback naar `X-App-User-Id` — onder geen enkele omstandigheid.**

---

## Release readiness

```text
[ ] Ik heb in App Store Connect gecontroleerd of externe TestFlight-testers oude builds gebruiken.
[ ] Ik heb bevestigd dat oude builds na de worker-deploy niet meer hoeven te werken.
[ ] Ik heb een Supabase database-backup gemaakt.
[ ] Ik heb SUPPORT_EMAIL ingevuld.
[ ] Ik heb een publiek bereikbare PRIVACY_POLICY_WEB_URL ingevuld.
[ ] Ik heb alle policy placeholders gecontroleerd.
[ ] Stripe live/test mode is bewust gecontroleerd.
[ ] Cloudflare worker secrets zijn ingesteld.
[ ] Supabase production URL en keys zijn gecontroleerd.
[ ] Ik heb buyer- en seller-testaccounts klaarstaan.
[ ] Ik heb een echt testproduct met voorraad klaarstaan.
[ ] Ik heb een tweede apparaat/account voor E2E-test.
```

---

## EAS / app build (vóór interne TestFlight)

```text
[ ] eas init uitgevoerd (projectId in app.json).
[ ] eas.json profielen development / preview / production gecontroleerd.
[ ] EAS environment variables gezet (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY).
[ ] App icon toegevoegd (1024×1024) — EAS build faalt anders.
[ ] Apple bundle ID com.lumen.fashion geregistreerd.
[ ] preview build succesvol (npx eas-cli build --profile preview --platform ios).
```

---

## Deploy-volgorde (alleen na volledige go)

1. Supabase backup
2. Migrations **0034 → 0035 → 0036** (niet overslaan, niet omkeren)
3. Worker deploy (`npm run deploy:worker`) — **breaking change voor oude app-builds**
4. Nieuwe EAS preview/internal build installeren
5. E2E-test (buyer + seller) — zie `docs/JWT_BREAKING_CHANGE_RELEASE_PLAN.md`
6. Bredere TestFlight pas na groene E2E

---

## No-go criteria (stop deploy)

- Externe TestFlight-testers op oude build **zonder** communicatieplan
- Geen Supabase backup
- `SUPPORT_EMAIL` of `PRIVACY_POLICY_WEB_URL` nog `[INVULLEN]`
- Worker secrets ontbreken
- Geen JWT-capable app-build klaar in hetzelfde release window als worker deploy
- E2E-test faalt op checkout, upload of seller flow

---

## Referenties

| Onderwerp | Document |
|-----------|----------|
| JWT breaking change | `docs/JWT_BREAKING_CHANGE_RELEASE_PLAN.md` |
| EAS profielen & commands | `docs/EAS_RELEASE_CONFIGURATION.md` |
| Migration rollback | `docs/PRE_DEPLOY_MIGRATION_0036.md` |
| Worker auth matrix | `docs/WORKER_ROUTES_AUTH.md` |
| Stripe test/live | `docs/STRIPE_LIVE_GO_LIVE_CHECKLIST.md` |
| App Store (later) | `docs/APP_STORE_SUBMISSION_CHECKLIST.md` |
