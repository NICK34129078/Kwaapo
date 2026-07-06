-- 0039: Restrict PII / secret columns on public.profiles to owner-only reads.
--
-- Problem (security.md #2): the "Profiles readable by authenticated" RLS policy
-- is row-level only. Postgres RLS cannot hide columns, so ANY authenticated user
-- could query PostgREST directly and read every seller's business_email,
-- kvk_number, street/house/postal, phone, VAT and stripe_connect_account_id
-- (a personal home address for individual sellers).
--
-- Fix: use column-level privileges to expose only non-sensitive columns to
-- clients, and let the owner read their own full record through a SECURITY
-- DEFINER RPC. The Cloudflare Worker keeps full access via the service role
-- (service_role bypasses these grants).
--
-- NOTE: requires the client repoints in this same change set:
--   - sellerOnboardingService.fetchMySellerOnboarding  -> rpc get_my_seller_onboarding
--   - sellerOnboardingService.updateMyBusinessInfo     -> re-fetch via that rpc
--   - sellerOnboardingService.fetchSellerOnboardingByProfileId -> safe columns only
--   - productsService seller lookup                    -> safe columns only

-- ---------------------------------------------------------------------------
-- 1. Replace blanket column access with an explicit safe-column allowlist.
-- ---------------------------------------------------------------------------
revoke select on public.profiles from anon;
revoke select on public.profiles from authenticated;

-- Columns safe for any authenticated user to read about any profile.
grant select (
  id,
  username,
  display_name,
  avatar_url,
  bio,
  account_type,
  seller_type,
  business_name,
  business_city,
  business_country,
  seller_onboarding_status,
  seller_verified_at,
  seller_rejection_reason,
  kvk_verified_at,
  stripe_connect_onboarding_complete,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_requirements_currently_due,
  stripe_requirements_disabled_reason,
  stripe_status_updated_at,
  seller_terms_version,
  seller_terms_accepted_at,
  seller_terms_accepted_by,
  account_deletion_status,
  created_at
) on public.profiles to authenticated;

-- anon (pre-login, e.g. username availability) only needs public identity.
grant select (id, username, display_name, avatar_url) on public.profiles to anon;

-- Intentionally NOT granted to anon/authenticated (owner-only, via RPC below):
--   business_email, business_phone, kvk_number, vat_number,
--   business_street, business_house_number, business_postal_code,
--   stripe_connect_account_id, kvk_verification_source

-- ---------------------------------------------------------------------------
-- 2. Owner reads its own full seller record via a definer RPC.
--    Filtered to auth.uid(), so a caller can only ever get their own row.
-- ---------------------------------------------------------------------------
create or replace function public.get_my_seller_onboarding()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.get_my_seller_onboarding() from public;
revoke all on function public.get_my_seller_onboarding() from anon;
grant execute on function public.get_my_seller_onboarding() to authenticated;
