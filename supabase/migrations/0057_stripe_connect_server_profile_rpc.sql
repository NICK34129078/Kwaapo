-- Server-only profile writes for Stripe Connect (worker service_role).
-- Direct PostgREST PATCH hits protect_profile_sensitive_columns because
-- request.jwt.claim.role is not always 'service_role' on REST writes.

create or replace function public.set_profile_stripe_connect_account(
  p_user_id uuid,
  p_account_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account text;
  v_existing text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id_required');
  end if;

  v_account := nullif(trim(coalesce(p_account_id, '')), '');
  if v_account is null or v_account not like 'acct_%' then
    return jsonb_build_object('success', false, 'error', 'invalid_account_id');
  end if;

  select nullif(trim(stripe_connect_account_id), '')
  into v_existing
  from public.profiles
  where id = p_user_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'profile_not_found');
  end if;

  if v_existing is not null and v_existing <> v_account then
    return jsonb_build_object(
      'success', true,
      'account_id', v_existing,
      'reused', true,
      'already_set', true
    );
  end if;

  if v_existing = v_account then
    return jsonb_build_object(
      'success', true,
      'account_id', v_account,
      'reused', true
    );
  end if;

  perform set_config('app.bypass_profile_protect', 'true', true);

  update public.profiles
  set stripe_connect_account_id = v_account
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'account_id', v_account,
    'created', true
  );
end;
$$;

create or replace function public.sync_profile_seller_payout_readiness(
  p_user_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patch jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_id_required');
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'profile_not_found');
  end if;

  perform set_config('app.bypass_profile_protect', 'true', true);

  update public.profiles
  set
    seller_onboarding_status = case
      when v_patch ? 'seller_onboarding_status'
        then (v_patch->>'seller_onboarding_status')::text
      else seller_onboarding_status
    end,
    stripe_connect_onboarding_complete = case
      when v_patch ? 'stripe_connect_onboarding_complete'
        then (v_patch->>'stripe_connect_onboarding_complete')::boolean
      else stripe_connect_onboarding_complete
    end,
    stripe_charges_enabled = case
      when v_patch ? 'stripe_charges_enabled'
        then (v_patch->>'stripe_charges_enabled')::boolean
      else stripe_charges_enabled
    end,
    stripe_payouts_enabled = case
      when v_patch ? 'stripe_payouts_enabled'
        then (v_patch->>'stripe_payouts_enabled')::boolean
      else stripe_payouts_enabled
    end,
    stripe_requirements_currently_due = case
      when v_patch ? 'stripe_requirements_currently_due'
        then coalesce(
          (select array_agg(value::text)
           from jsonb_array_elements_text(v_patch->'stripe_requirements_currently_due') as value),
          '{}'::text[]
        )
      else stripe_requirements_currently_due
    end,
    stripe_requirements_disabled_reason = case
      when v_patch ? 'stripe_requirements_disabled_reason'
        then nullif(v_patch->>'stripe_requirements_disabled_reason', '')
      else stripe_requirements_disabled_reason
    end,
    stripe_status_updated_at = case
      when v_patch ? 'stripe_status_updated_at'
        then (v_patch->>'stripe_status_updated_at')::timestamptz
      else stripe_status_updated_at
    end,
    seller_verified_at = case
      when v_patch ? 'seller_verified_at'
        then (v_patch->>'seller_verified_at')::timestamptz
      else seller_verified_at
    end,
    seller_rejection_reason = case
      when v_patch ? 'seller_rejection_reason'
        then nullif(v_patch->>'seller_rejection_reason', '')
      else seller_rejection_reason
    end
  where id = p_user_id;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.set_profile_stripe_connect_account(uuid, text) from public;
revoke all on function public.sync_profile_seller_payout_readiness(uuid, jsonb) from public;
revoke all on function public.set_profile_stripe_connect_account(uuid, text) from anon;
revoke all on function public.sync_profile_seller_payout_readiness(uuid, jsonb) from anon;
revoke all on function public.set_profile_stripe_connect_account(uuid, text) from authenticated;
revoke all on function public.sync_profile_seller_payout_readiness(uuid, jsonb) from authenticated;

grant execute on function public.set_profile_stripe_connect_account(uuid, text) to service_role;
grant execute on function public.sync_profile_seller_payout_readiness(uuid, jsonb) to service_role;

comment on function public.set_profile_stripe_connect_account is
  'Worker-only: idempotent Stripe Connect account id assignment with trigger bypass.';

comment on function public.sync_profile_seller_payout_readiness is
  'Worker-only: patch seller onboarding + Stripe status fields with trigger bypass.';
