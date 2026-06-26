import { supabase } from "../lib/supabase";
import { CURRENT_SELLER_TERMS_VERSION } from "../constants/sellerTerms";

export type SellerTermsAcceptance = {
  version: string | null;
  acceptedAt: string | null;
  acceptedBy: string | null;
};

type SellerTermsRow = {
  seller_terms_version: string | null;
  seller_terms_accepted_at: string | null;
  seller_terms_accepted_by: string | null;
};

export function hasAcceptedCurrentSellerTerms(
  acceptance: SellerTermsAcceptance | null | undefined
): boolean {
  return acceptance?.version === CURRENT_SELLER_TERMS_VERSION;
}

export async function fetchMySellerTermsAcceptance(): Promise<SellerTermsAcceptance | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "seller_terms_version, seller_terms_accepted_at, seller_terms_accepted_by"
    )
    .eq("id", user.id)
    .maybeSingle<SellerTermsRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return {
    version: data.seller_terms_version,
    acceptedAt: data.seller_terms_accepted_at,
    acceptedBy: data.seller_terms_accepted_by,
  };
}

export async function acceptCurrentSellerTerms(): Promise<SellerTermsAcceptance> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) {
    throw new Error("Niet ingelogd.");
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      seller_terms_version: CURRENT_SELLER_TERMS_VERSION,
      seller_terms_accepted_at: now,
      seller_terms_accepted_by: user.id,
    })
    .eq("id", user.id)
    .select(
      "seller_terms_version, seller_terms_accepted_at, seller_terms_accepted_by"
    )
    .single<SellerTermsRow>();

  if (error) {
    throw error;
  }

  return {
    version: data.seller_terms_version,
    acceptedAt: data.seller_terms_accepted_at,
    acceptedBy: data.seller_terms_accepted_by,
  };
}
