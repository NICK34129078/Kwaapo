-- =============================================================================
-- Kwaapo: RLS-guard voor publieke producten (verified Stripe seller)
-- =============================================================================
--
-- DOEL
--   Voorkom dat een verkoper een product publiek actief zet (is_active = true)
--   zonder volledige Stripe Connect payout-ready status.
--
-- WAT BLIJFT WERKEN
--   • Eigen producten lezen (actief + inactief)
--   • Concept/draft aanmaken met is_active = false
--   • Concept bewerken zolang is_active = false
--   • Product deactiveren (is_active true → false)
--   • Verwijderen van eigen producten
--
-- WAT WORDT GEBLOKKEERD
--   • INSERT met is_active = true zonder verified + Stripe payout-ready profiel
--   • UPDATE die is_active op true zet zonder verified + Stripe payout-ready
--
-- BACKUP (aanbevolen vóór uitvoeren)
--   Supabase Dashboard → Database → Backups, of exporteer policies:
--   select * from pg_policies where tablename = 'products';
--
-- HANDMATIG TESTEN NA RUN
--   1. Als niet-verified seller: insert draft (is_active false) → OK
--   2. Als niet-verified seller: insert/update is_active true → geweigerd
--   3. Als verified + Stripe actief: is_active true → OK
--
-- =============================================================================

-- Helper: profiles.id = auth.users.id = products.owner_id
create or replace function public.is_verified_payout_ready_seller(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.seller_onboarding_status = 'verified'
      and p.stripe_connect_account_id is not null
      and length(trim(p.stripe_connect_account_id)) > 0
      and p.stripe_connect_onboarding_complete = true
      and p.stripe_charges_enabled = true
      and p.stripe_payouts_enabled = true
  );
$$;

comment on function public.is_verified_payout_ready_seller(uuid) is
  'True when seller may publish active shop products (Stripe Connect payout-ready).';

revoke all on function public.is_verified_payout_ready_seller(uuid) from public;
grant execute on function public.is_verified_payout_ready_seller(uuid) to authenticated;

-- RLS is al enabled in 0014_products.sql; idempotent:
alter table public.products enable row level security;

-- Vervang insert-policy: drafts altijd; publiek alleen payout-ready
drop policy if exists "Owners insert own products" on public.products;

create policy "Owners insert own products"
  on public.products
  for insert
  to authenticated
  with check (
    auth.uid() = owner_id
    and (
      is_active = false
      or public.is_verified_payout_ready_seller(auth.uid())
    )
  );

-- Vervang update-policy: deactiveren altijd; activeren alleen payout-ready
drop policy if exists "Owners update own products" on public.products;

create policy "Owners update own products"
  on public.products
  for update
  to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and (
      is_active = false
      or public.is_verified_payout_ready_seller(auth.uid())
    )
  );

-- Bestaande policies ongewijzigd:
--   "Public read active products" (select where is_active = true)
--   "Owners read own products"
--   "Owners delete own products"

-- BESTAANDE DATA
--   Producten die al is_active = true hebben blijven zichtbaar.
--   Niet-verified sellers kunnen die rijen niet meer updaten zolang is_active true blijft
--   (tenzij ze eerst deactiveren). Overweeg handmatige cleanup indien nodig.
