# Secrets & environment audit

## Moet geheim blijven (nooit in app bundle / git)

| Secret | Waar | In client code? |
|--------|------|-----------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Worker `.dev.vars` / Wrangler secrets | **No** ✓ |
| `STRIPE_SECRET_KEY` | Worker secrets | **No** ✓ |
| `STRIPE_WEBHOOK_SECRET` | Worker secrets | **No** ✓ |
| `KVK_API_KEY` | Worker secrets | **No** ✓ |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Worker `.dev.vars` / Wrangler secrets | **No** ✓ |
| R2 credentials | Cloudflare binding | **No** ✓ |
| Supabase DB password | Dashboard only | **No** ✓ |

## Veilig publiek (mag in app)

| Key | Notes |
|-----|-------|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Designed for client; **RLS must protect data** |
| `CLOUD_VIDEO_WORKER_BASE` | Public worker URL |

## Geroteerd / opgeschoond in deze pass

| Item | Actie |
|------|-------|
| `.env.example` real anon key | **Vervangen door placeholders** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.example` | Verwijderd (niet gebruikt door app) |

## Aanbeveling: rotate als gedeeld

Als `.env.example` met **echte** anon key eerder gecommit was en repo ooit public was:

- Anon key rotatie is **optioneel** (publiek by design) maar overweeg rotatie bij RLS-zwaktes historisch.
- **Geen** service role of Stripe keys stonden in `.env.example` ✓

## Logs

- Worker auth failures: generic `[auth] token verification request failed` — geen token body.
- Client `formatUserFacingError` / `formatWorkerError`: geen raw JSON naar users.
- Verwijder productie `console.log` met user IDs waar mogelijk (nog enkele dev logs in upload paths).

## `.env` (lokaal)

- Blijft gitignored ✓
- Bevat alleen `EXPO_PUBLIC_SUPABASE_*` (+ optioneel `EXPO_PUBLIC_SHARE_BASE_URL`)
- **Geen** `SPOTIFY_*`, `NEXT_PUBLIC_*`, Stripe of service role

## `.dev.vars` (lokaal worker)

- Kopieer van `.dev.vars.example`; gitignored ✓
- Spotify + Supabase service role voor `wrangler dev`
