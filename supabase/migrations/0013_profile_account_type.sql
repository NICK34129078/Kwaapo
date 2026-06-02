-- Account types on public.profiles (marketplace foundation — step 1)

alter table public.profiles
  add column if not exists account_type text;

update public.profiles
  set account_type = 'consumer'
  where account_type is null;

alter table public.profiles
  alter column account_type set default 'consumer';

alter table public.profiles
  alter column account_type set not null;

-- Normalize unexpected values before check constraint
update public.profiles
  set account_type = 'consumer'
  where account_type not in ('consumer', 'creator', 'business');

alter table public.profiles
  drop constraint if exists profiles_account_type_check;

alter table public.profiles
  add constraint profiles_account_type_check
  check (account_type in ('consumer', 'creator', 'business'));

comment on column public.profiles.account_type is
  'Account role: consumer (default), creator, or business.';
