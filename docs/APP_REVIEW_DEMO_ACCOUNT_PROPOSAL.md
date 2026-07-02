# App Review testaccount & demo-content voorstel

> Read-only audit — **geen accounts of posts gewijzigd** in Ronde 1.

## 1. Huidige testaccounts / gebruikersnamen — niet geschikt voor review

| Gebruiker / context | Waarom niet geschikt |
|---------------------|----------------------|
| `nicoisgay` (testaccount B uit eerdere feed-tests) | Gebruikersnaam is onprofessioneel en kan App Review screenshots of reviewer-ervaring schaden. |
| `cantinaband` (testaccount A) | Intern testaccount; OK voor dev, niet als primaire reviewer-login tenzij profiel netjes is ingericht. |
| `test@example.com` in `ordersService.ts` | Alleen fallback in legacy checkout-helper — niet zichtbaar in UI, maar vermijd echte orders met dit adres. |

## 2. Testposts / hashtags — review met voorzichtigheid

- Hashtags uit interne ranking-tests (`#summer`, `#fashion`, `#winter`) zijn **inhoudelijk OK** als de bijbehorende media netjes is.
- Posts zonder hashtags of met willekeurige interne captions moeten **niet** de eerste feed vormen die een reviewer ziet — explore/personalized ranking kan lege of rommelige content tonen als productie-data dun is.

## 3. Voorstel: één App Review testaccount

Maak **handmatig** (jij, in Supabase/dashboard) een dedicated account:

| Veld | Aanbevolen waarde |
|------|-------------------|
| E-mail | `appreview@kwaapo.nl` (of jouw domein) |
| Wachtwoord | Sterk, uniek; noteer in App Store Connect → App Review Information |
| Username | `@kwaapodemo` |
| Display name | `Kwaapo Demo` |
| Bio | Korte uitleg: “Officieel demo-account voor App Review.” |
| Profielfoto | Neutrale Kwaapo-consistente avatar (geen default placeholder) |

**App Review notes (Engels, kort):**
- Login: `appreview@kwaapo.nl` / `[wachtwoord]`
- Reels-tab = personalized feed; Search = users; Profile → Settings = policies + account deletion.
- Marketplace/Shop is optional; checkout uses Stripe test mode in preview builds.

## 4. Voorstel: kleine set nette demo-posts (3–5)

Plaats **alleen** via het demo-account, vóór submission:

| # | Type | Hashtags | Caption-richting |
|---|------|----------|------------------|
| 1 | Video reel ≤15s | `#fashion #style` | Neutrale outfit / street style |
| 2 | Foto-post | `#summer #outfit` | Zomerlook, geen merkschending |
| 3 | Video reel | `#classy #minimal` | Rustige esthetiek |
| 4 | Optioneel productpost | `#shop` | Alleen als marketplace in scope; echt product, geen €0,01 test |

**Vermijd:** scheldwoorden in usernames, politieke content, copyrighted muziek zonder licentie, lege captions op alle posts.

## 5. Wat niet automatisch is gedaan

- Geen Supabase users/posts aangepast.
- Geen publieke content live gezet.
- Geen wijzigingen aan bestaande testaccounts (`nicoisgay`, etc.) — meld als je wilt dat we die anonimiseren of verwijderen in een aparte ronde.
