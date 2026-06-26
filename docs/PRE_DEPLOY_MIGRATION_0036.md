# Migration 0036 — pre-deploy review

## Backup (verplicht vóór run)

1. Supabase Dashboard → **Database → Backups** → noteer laatste backup / maak manual backup op Pro plan.
2. Export optioneel:
   ```sql
   -- snapshot counts
   select 'products' t, count(*) from products
   union all select 'profiles', count(*) from profiles
   union all select 'posts', count(*) from posts;
   ```

## Rollback (noodgeval)

Migration is grotendeels **additive**. Rollback = handmatig:

```sql
-- Triggers
drop trigger if exists orders_notify_buyer_shipped on public.orders;
drop trigger if exists profiles_protect_sensitive on public.profiles;

-- Optioneel tabellen behouden (audit trail)
-- drop table if exists public.moderation_reports;
-- drop table if exists public.buyer_notifications;
-- drop table if exists public.account_deletion_requests;

-- Products policy terug (zonder moderation filter)
drop policy if exists "Public read active products" on public.products;
create policy "Public read active products"
  on public.products for select to authenticated, anon
  using (is_active = true);

-- Kolom moderation_status kan blijven; niet destructief droppen tenzij nodig
```

**Geen automatische down migration** — plan rollback vóór productie-run.

## Data backfill

| Item | Actie in 0036 |
|------|----------------|
| `products.moderation_status` | `UPDATE … SET 'approved' WHERE NULL` vóór NOT NULL |
| Bestaande actieve producten | Blijven zichtbaar (`approved`) |
| Bestaande posts | Geen wijziging; RLS tighten — **worker gebruikt service_role** |
| Profiles zonder RLS | Policies toegevoegd; geen data mutatie |

## Risico-analyse

| Check | Status |
|-------|--------|
| Checkout/order flow | Geen order-schema wijziging; seller guard uitgebreid |
| Feed | Global feed worker unchanged; posts SELECT still public for non-deleted |
| Client post insert via worker | service_role bypasses posts RLS ✓ |
| Direct client post UPDATE | Alleen eigen `user_id` — correct |
| Product shop read | Alleen `moderation_status = 'approved'` — bestaande backfill OK |
| Buyer ship notify | Idempotent `ON CONFLICT DO NOTHING` + unique constraint |
| Account deletion RPC | Alleen `auth.uid()`; trigger bypass via `app.bypass_profile_protect` |
| Reports RLS | Users read/insert own only; geen UPDATE policy |
| Deleted profiles hidden | SELECT policy excludes requested/processing/completed |

## Handmatige verificatie na push

```sql
-- moderation backfill
select moderation_status, count(*) from products group by 1;

-- deletion RPC test (test user)
-- select public.request_account_deletion('test');

-- buyer notification dedup constraint
select indexname from pg_indexes where tablename = 'buyer_notifications';
```

## Volgorde

1. Deze migration (`0036_prelaunch_compliance.sql`)
2. Worker deploy (JWT auth — **app + worker moeten tegelijk**)
3. App rebuild (Authorization headers)

**Belangrijk:** Oude app builds met alleen `X-App-User-Id` werken **niet** meer na worker deploy. Deploy worker + app close together.
