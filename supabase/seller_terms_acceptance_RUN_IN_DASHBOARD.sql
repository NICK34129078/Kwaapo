-- Plak in Supabase SQL Editor (zelfde als migrations/0035_seller_terms_acceptance.sql)

alter table public.profiles
  add column if not exists seller_terms_version text null,
  add column if not exists seller_terms_accepted_at timestamptz null,
  add column if not exists seller_terms_accepted_by uuid null references public.profiles (id);

comment on column public.profiles.seller_terms_version is
  'Laatst geaccepteerde seller policy versie (app constant).';
comment on column public.profiles.seller_terms_accepted_at is
  'Tijdstip van acceptatie huidige seller policy.';
comment on column public.profiles.seller_terms_accepted_by is
  'Profile id die de seller policy accepteerde.';
