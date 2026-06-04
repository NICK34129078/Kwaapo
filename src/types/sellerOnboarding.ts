export type SellerOnboardingStatus =
  | "not_started"
  | "needs_business_info"
  | "pending_review"
  | "verified"
  | "rejected";

export type SellerType = "individual" | "business";

export type SellerOnboardingRow = {
  id: string;
  seller_onboarding_status: string;
  seller_type: string | null;
  business_name: string | null;
  kvk_number: string | null;
  vat_number: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_country: string | null;
  business_city: string | null;
  business_postal_code: string | null;
  business_street: string | null;
  business_house_number: string | null;
  stripe_connect_account_id: string | null;
  stripe_connect_onboarding_complete: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  seller_verified_at: string | null;
  seller_rejection_reason: string | null;
  display_name: string | null;
  kvk_verified_at: string | null;
  kvk_verification_source: string | null;
};

export type SellerOnboarding = {
  profileId: string;
  status: SellerOnboardingStatus;
  sellerType: SellerType | null;
  businessName: string | null;
  kvkNumber: string | null;
  vatNumber: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  businessCountry: string | null;
  businessCity: string | null;
  businessPostalCode: string | null;
  businessStreet: string | null;
  businessHouseNumber: string | null;
  stripeConnectAccountId: string | null;
  stripeConnectOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  sellerVerifiedAt: string | null;
  sellerRejectionReason: string | null;
  displayName: string | null;
  kvkVerifiedAt: string | null;
  kvkVerificationSource: string | null;
};

export type BusinessInfoPayload = {
  sellerType: SellerType;
  businessName: string;
  kvkNumber?: string | null;
  vatNumber?: string | null;
  businessEmail: string;
  businessPhone?: string | null;
  businessCountry: string;
  businessCity: string;
  businessPostalCode: string;
  businessStreet: string;
  businessHouseNumber: string;
};

const ONBOARDING_STATUSES: SellerOnboardingStatus[] = [
  "not_started",
  "needs_business_info",
  "pending_review",
  "verified",
  "rejected",
];

export function isSellerOnboardingStatus(
  value: string | null | undefined
): value is SellerOnboardingStatus {
  return (
    typeof value === "string" &&
    (ONBOARDING_STATUSES as string[]).includes(value)
  );
}

export function isSellerType(value: string | null | undefined): value is SellerType {
  return value === "individual" || value === "business";
}

export function mapSellerOnboardingRow(row: SellerOnboardingRow): SellerOnboarding {
  return {
    profileId: row.id,
    status: isSellerOnboardingStatus(row.seller_onboarding_status)
      ? row.seller_onboarding_status
      : "not_started",
    sellerType: isSellerType(row.seller_type) ? row.seller_type : null,
    businessName: row.business_name,
    kvkNumber: row.kvk_number,
    vatNumber: row.vat_number,
    businessEmail: row.business_email,
    businessPhone: row.business_phone,
    businessCountry: row.business_country,
    businessCity: row.business_city,
    businessPostalCode: row.business_postal_code,
    businessStreet: row.business_street,
    businessHouseNumber: row.business_house_number,
    stripeConnectAccountId: row.stripe_connect_account_id,
    stripeConnectOnboardingComplete: !!row.stripe_connect_onboarding_complete,
    stripeChargesEnabled: !!row.stripe_charges_enabled,
    stripePayoutsEnabled: !!row.stripe_payouts_enabled,
    sellerVerifiedAt: row.seller_verified_at,
    sellerRejectionReason: row.seller_rejection_reason,
    displayName: row.display_name,
    kvkVerifiedAt: row.kvk_verified_at ?? null,
    kvkVerificationSource: row.kvk_verification_source ?? null,
  };
}
