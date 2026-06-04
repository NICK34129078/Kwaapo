-- Audit trail for automated KVK Basisprofiel verification at seller onboarding save

alter table public.profiles
  add column if not exists kvk_verified_at timestamptz null;

alter table public.profiles
  add column if not exists kvk_verification_source text null;

comment on column public.profiles.kvk_verified_at is
  'Timestamp when KVK number was last verified against KVK Basisprofiel API.';

comment on column public.profiles.kvk_verification_source is
  'Source of KVK verification, e.g. kvk_basisprofiel.';
