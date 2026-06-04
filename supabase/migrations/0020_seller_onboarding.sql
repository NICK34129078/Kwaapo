-- Seller onboarding foundation (verification + payout readiness metadata; no Connect API yet)

alter table public.profiles
  add column if not exists seller_onboarding_status text;

update public.profiles
  set seller_onboarding_status = 'not_started'
  where seller_onboarding_status is null;

alter table public.profiles
  alter column seller_onboarding_status set default 'not_started';

alter table public.profiles
  alter column seller_onboarding_status set not null;

alter table public.profiles
  add column if not exists seller_type text null;

alter table public.profiles
  add column if not exists business_name text null;

alter table public.profiles
  add column if not exists kvk_number text null;

alter table public.profiles
  add column if not exists vat_number text null;

alter table public.profiles
  add column if not exists business_email text null;

alter table public.profiles
  add column if not exists business_phone text null;

alter table public.profiles
  add column if not exists business_country text null;

alter table public.profiles
  add column if not exists business_city text null;

alter table public.profiles
  add column if not exists business_postal_code text null;

alter table public.profiles
  add column if not exists business_street text null;

alter table public.profiles
  add column if not exists business_house_number text null;

alter table public.profiles
  add column if not exists stripe_connect_account_id text null;

alter table public.profiles
  add column if not exists stripe_connect_onboarding_complete boolean;

update public.profiles
  set stripe_connect_onboarding_complete = false
  where stripe_connect_onboarding_complete is null;

alter table public.profiles
  alter column stripe_connect_onboarding_complete set default false;

alter table public.profiles
  alter column stripe_connect_onboarding_complete set not null;

alter table public.profiles
  add column if not exists stripe_charges_enabled boolean;

update public.profiles
  set stripe_charges_enabled = false
  where stripe_charges_enabled is null;

alter table public.profiles
  alter column stripe_charges_enabled set default false;

alter table public.profiles
  alter column stripe_charges_enabled set not null;

alter table public.profiles
  add column if not exists stripe_payouts_enabled boolean;

update public.profiles
  set stripe_payouts_enabled = false
  where stripe_payouts_enabled is null;

alter table public.profiles
  alter column stripe_payouts_enabled set default false;

alter table public.profiles
  alter column stripe_payouts_enabled set not null;

alter table public.profiles
  add column if not exists seller_verified_at timestamptz null;

alter table public.profiles
  add column if not exists seller_rejection_reason text null;

update public.profiles
  set seller_onboarding_status = 'not_started'
  where seller_onboarding_status not in (
    'not_started',
    'needs_business_info',
    'pending_review',
    'verified',
    'rejected'
  );

alter table public.profiles
  drop constraint if exists profiles_seller_onboarding_status_check;

alter table public.profiles
  add constraint profiles_seller_onboarding_status_check
  check (
    seller_onboarding_status in (
      'not_started',
      'needs_business_info',
      'pending_review',
      'verified',
      'rejected'
    )
  );

update public.profiles
  set seller_type = null
  where seller_type is not null
    and seller_type not in ('individual', 'business');

alter table public.profiles
  drop constraint if exists profiles_seller_type_check;

alter table public.profiles
  add constraint profiles_seller_type_check
  check (seller_type is null or seller_type in ('individual', 'business'));

comment on column public.profiles.seller_onboarding_status is
  'Seller verification lifecycle: not_started, needs_business_info, pending_review, verified, rejected.';

comment on column public.profiles.stripe_connect_account_id is
  'Reserved for future Stripe Connect account id (not used in test mode).';
