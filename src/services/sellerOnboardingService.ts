import { supabase } from "../lib/supabase";
import {
  normalizeKvkNumberInput,
  verifyKvkBusinessDetails,
} from "./kvkVerifyService";
import {
  isSellerType,
  mapSellerOnboardingRow,
  type BusinessInfoPayload,
  type SellerOnboarding,
  type SellerOnboardingRow,
  type SellerOnboardingStatus,
} from "../types/sellerOnboarding";

const SELLER_ONBOARDING_COLUMNS =
  "id, seller_onboarding_status, seller_type, business_name, kvk_number, vat_number, business_email, business_phone, business_country, business_city, business_postal_code, business_street, business_house_number, stripe_connect_account_id, stripe_connect_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, seller_verified_at, seller_rejection_reason, display_name, kvk_verified_at, kvk_verification_source";

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }
  return user.id;
}

function validateBusinessPayload(payload: BusinessInfoPayload): BusinessInfoPayload {
  const businessName = clean(payload.businessName);
  const businessEmail = clean(payload.businessEmail).toLowerCase();
  const businessCountry = clean(payload.businessCountry);
  const businessCity = clean(payload.businessCity);
  const businessPostalCode = clean(payload.businessPostalCode);
  const businessStreet = clean(payload.businessStreet);
  const businessHouseNumber = clean(payload.businessHouseNumber);
  const businessPhone = clean(payload.businessPhone) || null;
  const vatNumber = clean(payload.vatNumber) || null;

  if (!isSellerType(payload.sellerType)) {
    throw new Error("Kies hoe je verkoopt: persoonlijk of bedrijf.");
  }
  if (!businessName) {
    throw new Error("Vul een naam of bedrijfsnaam in.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    throw new Error("Vul een geldig zakelijk e-mailadres in.");
  }
  if (!businessCountry || !businessCity || !businessPostalCode) {
    throw new Error("Vul land, stad en postcode in.");
  }
  if (!businessStreet || !businessHouseNumber) {
    throw new Error("Vul straat en huisnummer in.");
  }

  if (payload.sellerType === "business") {
    const kvkNumber = normalizeKvkNumberInput(clean(payload.kvkNumber));
    if (!kvkNumber) {
      throw new Error("Vul een geldig KVK-nummer in (8 cijfers).");
    }
    return {
      ...payload,
      businessName,
      businessEmail,
      businessCountry,
      businessCity,
      businessPostalCode,
      businessStreet,
      businessHouseNumber,
      businessPhone,
      vatNumber,
      kvkNumber,
    };
  }

  return {
    ...payload,
    businessName,
    businessEmail,
    businessCountry,
    businessCity,
    businessPostalCode,
    businessStreet,
    businessHouseNumber,
    businessPhone,
    vatNumber,
    kvkNumber: null,
  };
}

/** Verkoper mag officiële uitbetalingen ontvangen (live-modus). */
export function canSellerReceivePayments(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  if (!onboarding) {
    return false;
  }
  return (
    onboarding.status === "verified" &&
    onboarding.stripePayoutsEnabled &&
    onboarding.stripeChargesEnabled
  );
}

/** Account handmatig goedgekeurd voor verkoop. */
export function isSellerVerified(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return onboarding?.status === "verified";
}

/** Producten toevoegen/beheren — alleen na goedkeuring. */
export function canSellerManageProducts(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return isSellerVerified(onboarding);
}

/** Echte verkoop/checkout — alleen na handmatige goedkeuring (verified). */
export function canSellerAcceptSales(
  onboarding:
    | SellerOnboarding
    | Pick<SellerOnboarding, "status">
    | null
    | undefined
): boolean {
  return onboarding?.status === "verified";
}

export function hasCompletedStripePayoutSetup(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return !!onboarding?.stripeConnectOnboardingComplete;
}

/** Bepaal onboarding-stap (1=gegevens, 2=Stripe, 3=indienen). */
export function resolveSellerOnboardingStep(
  onboarding: SellerOnboarding | null | undefined
): 1 | 2 | 3 {
  if (
    !onboarding ||
    onboarding.status === "not_started" ||
    !onboarding.sellerType ||
    !clean(onboarding.businessName)
  ) {
    return 1;
  }
  if (!hasCompletedStripePayoutSetup(onboarding)) {
    return 2;
  }
  return 3;
}

/** Toon waarschuwing op productpagina als verkoper nog niet geverifieerd is. */
export function shouldWarnUnverifiedSeller(
  onboarding: SellerOnboarding | Pick<SellerOnboarding, "status"> | null | undefined
): boolean {
  if (!onboarding) {
    return true;
  }
  return onboarding.status !== "verified";
}

export function sellerPayoutStatusLabel(
  onboarding: SellerOnboarding | null | undefined
): string {
  if (!onboarding) {
    return "Uitbetalingen nog niet actief";
  }
  if (onboarding.status === "verified") {
    if (onboarding.stripePayoutsEnabled) {
      return "Uitbetalingen actief";
    }
    return "Verificatie klaar — uitbetalingen worden nog ingesteld";
  }
  if (onboarding.status === "pending_review") {
    return "Uitbetalingen nog niet actief";
  }
  if (onboarding.status === "rejected") {
    return "Verificatie nodig";
  }
  return "Verificatie nodig";
}

export type SellerStatusCardContent = {
  title: string;
  message: string;
  buttonLabel: string;
  tone: "default" | "success" | "warning" | "danger";
};

export function getSellerStatusCardContent(
  status: SellerOnboardingStatus,
  rejectionReason?: string | null
): SellerStatusCardContent {
  switch (status) {
    case "not_started":
      return {
        title: "Verkoopaccount instellen",
        message:
          "Vul je verkopersgegevens in voordat je officiële betalingen kunt ontvangen.",
        buttonLabel: "Start verificatie",
        tone: "default",
      };
    case "needs_business_info":
      return {
        title: "Gegevens aanvullen",
        message:
          "Vul KVK en bedrijfsgegevens in en stel daarna je uitbetalingen in via Stripe.",
        buttonLabel: "Verder met verificatie",
        tone: "warning",
      };
    case "pending_review":
      return {
        title: "In controle",
        message:
          "We controleren je gegevens. Je kunt nog geen producten toevoegen of verkopen tot je account is goedgekeurd.",
        buttonLabel: "Status bekijken",
        tone: "warning",
      };
    case "verified":
      return {
        title: "Verkoopaccount actief",
        message: "Je account is klaar voor officiële verkoop.",
        buttonLabel: "Gegevens bekijken",
        tone: "success",
      };
    case "rejected":
      return {
        title: "Verificatie afgewezen",
        message:
          rejectionReason?.trim() ||
          "Je gegevens voldoen nog niet. Pas je gegevens aan en dien opnieuw in.",
        buttonLabel: "Gegevens aanpassen",
        tone: "danger",
      };
    default:
      return {
        title: "Verkoopaccount instellen",
        message: "Vul je verkopersgegevens in om te kunnen verkopen.",
        buttonLabel: "Start verificatie",
        tone: "default",
      };
  }
}

export async function fetchMySellerOnboarding(): Promise<SellerOnboarding | null> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .select(SELLER_ONBOARDING_COLUMNS)
    .eq("id", userId)
    .maybeSingle<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapSellerOnboardingRow(data);
}

export async function fetchSellerOnboardingByProfileId(
  profileId: string
): Promise<SellerOnboarding | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(SELLER_ONBOARDING_COLUMNS)
    .eq("id", profileId)
    .maybeSingle<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapSellerOnboardingRow(data);
}

export async function updateMyBusinessInfo(
  payload: BusinessInfoPayload
): Promise<SellerOnboarding> {
  const userId = await getCurrentUserId();
  const validated = validateBusinessPayload(payload);

  let kvkVerifiedAt: string | null = null;
  let kvkVerificationSource: string | null = null;

  if (validated.sellerType === "business" && validated.kvkNumber) {
    await verifyKvkBusinessDetails({
      ...validated,
      kvkNumber: validated.kvkNumber,
    });
    kvkVerifiedAt = new Date().toISOString();
    kvkVerificationSource = "kvk_basisprofiel";
  } else if (validated.sellerType === "individual") {
    kvkVerifiedAt = null;
    kvkVerificationSource = null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      seller_type: validated.sellerType,
      business_name: validated.businessName,
      kvk_number: validated.kvkNumber ?? null,
      vat_number: validated.vatNumber ?? null,
      business_email: validated.businessEmail,
      business_phone: validated.businessPhone,
      business_country: validated.businessCountry,
      business_city: validated.businessCity,
      business_postal_code: validated.businessPostalCode,
      business_street: validated.businessStreet,
      business_house_number: validated.businessHouseNumber,
      seller_onboarding_status: "needs_business_info",
      seller_rejection_reason: null,
      kvk_verified_at: kvkVerifiedAt,
      kvk_verification_source: kvkVerificationSource,
    })
    .eq("id", userId)
    .select(SELLER_ONBOARDING_COLUMNS)
    .single<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  return mapSellerOnboardingRow(data);
}

export async function markSellerPendingReview(): Promise<SellerOnboarding> {
  const userId = await getCurrentUserId();

  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select(SELLER_ONBOARDING_COLUMNS)
    .eq("id", userId)
    .single<SellerOnboardingRow>();

  if (readError) {
    throw readError;
  }

  const onboarding = mapSellerOnboardingRow(current);
  if (!onboarding.sellerType) {
    throw new Error("Kies eerst hoe je verkoopt.");
  }
  if (!clean(onboarding.businessName) || !clean(onboarding.businessEmail)) {
    throw new Error("Vul eerst je gegevens in.");
  }
  if (
    onboarding.sellerType === "business" &&
    !clean(onboarding.kvkNumber)
  ) {
    throw new Error("Vul je KVK-nummer in.");
  }
  if (!onboarding.stripeConnectOnboardingComplete) {
    throw new Error("Stel eerst je uitbetalingen via Stripe in.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({
      seller_onboarding_status: "pending_review",
      seller_rejection_reason: null,
    })
    .eq("id", userId)
    .select(SELLER_ONBOARDING_COLUMNS)
    .single<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  return mapSellerOnboardingRow(data);
}

/**
 * Testmodus: markeer Stripe-uitbetalingen als voorbereid (geen echte Connect API).
 */
export async function markMyStripePayoutSetupPrepared(): Promise<SellerOnboarding> {
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("profiles")
    .update({ stripe_connect_onboarding_complete: true })
    .eq("id", userId)
    .select(SELLER_ONBOARDING_COLUMNS)
    .single<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  return mapSellerOnboardingRow(data);
}
