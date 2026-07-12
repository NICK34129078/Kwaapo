-- Seller onboarding step 1: persist business info including KVK fields that the
-- protect_profile_sensitive_columns trigger blocks for the authenticated role.
-- Same bypass pattern as request_account_deletion (app.bypass_profile_protect).

create or replace function public.update_my_seller_business_info(
  p_seller_type text,
  p_business_name text,
  p_kvk_number text,
  p_vat_number text,
  p_business_email text,
  p_business_phone text,
  p_business_country text,
  p_business_city text,
  p_business_postal_code text,
  p_business_street text,
  p_business_house_number text,
  p_kvk_verified_at timestamptz default null,
  p_kvk_verification_source text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_seller_type text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_seller_type := nullif(trim(coalesce(p_seller_type, '')), '');
  if v_seller_type is null or v_seller_type not in ('individual', 'business') then
    return jsonb_build_object('success', false, 'error', 'invalid_seller_type');
  end if;

  if nullif(trim(coalesce(p_business_name, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'business_name_required');
  end if;

  if nullif(trim(coalesce(p_business_email, '')), '') is null then
    return jsonb_build_object('success', false, 'error', 'business_email_required');
  end if;

  perform set_config('app.bypass_profile_protect', 'true', true);

  update public.profiles
  set
    seller_type = v_seller_type,
    business_name = nullif(trim(p_business_name), ''),
    kvk_number = case
      when v_seller_type = 'business' then nullif(trim(coalesce(p_kvk_number, '')), '')
      else null
    end,
    vat_number = nullif(trim(coalesce(p_vat_number, '')), ''),
    business_email = nullif(trim(p_business_email), ''),
    business_phone = nullif(trim(coalesce(p_business_phone, '')), ''),
    business_country = nullif(trim(coalesce(p_business_country, '')), ''),
    business_city = nullif(trim(coalesce(p_business_city, '')), ''),
    business_postal_code = nullif(trim(coalesce(p_business_postal_code, '')), ''),
    business_street = nullif(trim(coalesce(p_business_street, '')), ''),
    business_house_number = nullif(trim(coalesce(p_business_house_number, '')), ''),
    seller_onboarding_status = 'needs_business_info',
    seller_rejection_reason = null,
    kvk_verified_at = case
      when v_seller_type = 'business' then p_kvk_verified_at
      else null
    end,
    kvk_verification_source = case
      when v_seller_type = 'business' then nullif(trim(coalesce(p_kvk_verification_source, '')), '')
      else null
    end,
    account_type = case
      when v_seller_type = 'business' then 'business'
      else account_type
    end
  where id = v_user;

  if not found then
    return jsonb_build_object('success', false, 'error', 'profile_not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.update_my_seller_business_info(
  text, text, text, text, text, text, text, text, text, text, text, timestamptz, text
) from public;

grant execute on function public.update_my_seller_business_info(
  text, text, text, text, text, text, text, text, text, text, text, timestamptz, text
) to authenticated;

comment on function public.update_my_seller_business_info is
  'Owner-only seller onboarding step 1. Sets account_type=business when seller_type=business.';
