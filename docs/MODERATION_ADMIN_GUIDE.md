# Moderation admin guide (handmatig in Supabase)

Geen admin-dashboard in de app — beoordeel meldingen via Supabase Dashboard → SQL Editor of Table Editor.

## Tabellen

| Tabel | Inhoud |
|-------|--------|
| `moderation_reports` | Product-, profiel-, seller-meldingen |
| `post_reports` | Reels/post-meldingen (bestaand) |
| `user_blocks` | Blokkades |

## Open meldingen ophalen

```sql
select id, target_type, target_id, reason, status, created_at, reporter_id
from public.moderation_reports
where status in ('open', 'under_review')
order by created_at asc;
```

```sql
select id, post_id, reason, status, created_at, reporter_id
from public.post_reports
where status = 'pending'
order by created_at asc;
```

## Product onder review zetten / verwijderen

Ernstige productmelding zet automatisch `moderation_status = 'under_review'` bij eerste report.

```sql
-- Verberg product publiek
update public.products
set moderation_status = 'removed', is_active = false
where id = 'PRODUCT_UUID';

update public.moderation_reports
set status = 'resolved_removed',
    reviewed_at = now(),
    decision_reason = 'Prohibited listing'
where target_type = 'product' and target_id = 'PRODUCT_UUID';
```

## Seller schorsen

```sql
update public.profiles
set moderation_suspended_at = now()
where id = 'SELLER_UUID';

update public.products
set is_active = false
where owner_id = 'SELLER_UUID';
```

## Report afhandelen (geen actie)

```sql
update public.moderation_reports
set status = 'resolved_no_action',
    reviewed_at = now(),
    decision_reason = 'No violation found'
where id = 'REPORT_UUID';
```

## Account deletion requests

Status flow: `requested` → `processing` → `completed` | `rejected`

```sql
select id, user_id, status, reason, requested_at, processed_at
from public.account_deletion_requests
where status in ('requested', 'processing')
order by requested_at asc;
```

### Admin checklist per request

1. **Profiel al verborgen** — RPC zet `account_deletion_status = 'requested'`, anon username/display_name, posts/products gedeactiveerd; profiel niet meer zichtbaar via profiles SELECT policy.
2. **Controleer open orders** — financiële records blijven; geen publieke koppeling meer via profiel.
3. **Verwijder auth user** — Supabase Dashboard → Authentication → Users → delete user `USER_UUID`.
   - Of via Admin API met service role (niet in app).
4. **Markeer completed**:

```sql
update public.account_deletion_requests
set status = 'completed', processed_at = now()
where user_id = 'USER_UUID';

update public.profiles
set account_deletion_status = 'completed'
where id = 'USER_UUID';
```

5. **Storage cleanup** (handmatig indien nodig): avatars bucket, post media via worker/R2 lifecycle.

### Reject (bijv. open dispute)

```sql
update public.account_deletion_requests
set status = 'rejected', processed_at = now()
where user_id = 'USER_UUID';

update public.profiles
set account_deletion_status = null
where id = 'USER_UUID';
-- Herstel username/display_name handmatig indien nodig — case-by-case.
```

## Rollback migration 0036 (alleen noodgeval)

```sql
drop trigger if exists orders_notify_buyer_shipped on public.orders;
drop trigger if exists profiles_protect_sensitive on public.profiles;
-- Tabellen moderation_reports, buyer_notifications, account_deletion_requests
-- kunnen blijven staan; data is audit trail.
```
