-- Extra Stripe Connect status (geen gevoelige KYC/bankdata; alleen requirements-metadata).

alter table public.profiles
  add column if not exists stripe_requirements_currently_due jsonb null;

alter table public.profiles
  add column if not exists stripe_requirements_disabled_reason text null;

alter table public.profiles
  add column if not exists stripe_status_updated_at timestamptz null;

comment on column public.profiles.stripe_requirements_currently_due is
  'Stripe requirements.currently_due (veldnamen alleen; geen documenten).';

comment on column public.profiles.stripe_requirements_disabled_reason is
  'Stripe requirements.disabled_reason indien account beperkt is.';

comment on column public.profiles.stripe_status_updated_at is
  'Laatste server-side sync van Stripe Account API of account.updated webhook.';
