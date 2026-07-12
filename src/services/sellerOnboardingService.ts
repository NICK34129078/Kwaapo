import { supabase } from "../lib/supabase";
import { logSellerOnboarding } from "../constants/sellerOnboardingDebug";
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
  type SellerType,
} from "../types/sellerOnboarding";
import {
  logSellerSaveErrorDev,
  mapSellerRpcError,
  mapSellerSaveError,
} from "../utils/sellerOnboardingErrors";

import {
  hasCompletedStripeOnboardingForm,
  isStripeConnectPayoutReady,
} from "../utils/stripeConnectState";
import { resolveSellerOnboardingStep } from "../utils/sellerOnboardingStep";

export { resolveSellerOnboardingStep };

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

async function getCurrentUserId(): Promise<string> {
  logSellerOnboarding("SELLER_AUTH_GET_USER_START");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    logSellerOnboarding("SELLER_AUTH_GET_USER_FAILED", {
      code: (error as { code?: string }).code ?? null,
      message: error.message?.slice(0, 120) ?? null,
    });
    throw error;
  }
  if (!user?.id) {
    logSellerOnboarding("SELLER_AUTH_GET_USER_FAILED", { reason: "no_user" });
    throw new Error("Niet ingelogd.");
  }
  logSellerOnboarding("SELLER_AUTH_GET_USER_SUCCESS", {
    userIdPrefix: user.id.slice(0, 8),
  });
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
    const rawKvk = clean(payload.kvkNumber);
    logSellerOnboarding("SELLER_KVK_RAW_INPUT", {
      length: rawKvk.length,
      hasSeparators: /[\s-]/.test(rawKvk),
    });
    const kvkNumber = normalizeKvkNumberInput(rawKvk);
    logSellerOnboarding("SELLER_KVK_NORMALIZED", {
      ok: !!kvkNumber,
      length: kvkNumber?.length ?? 0,
    });
    if (!kvkNumber) {
      logSellerOnboarding("SELLER_KVK_VALIDATION_RESULT", { valid: false });
      throw new Error("Vul een geldig KVK-nummer in (8 cijfers).");
    }
    logSellerOnboarding("SELLER_KVK_VALIDATION_RESULT", { valid: true });
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

/** Minimale velden voor payout-ready check (client UX; server/RLS is bron van waarheid). */
export type SellerPayoutReadyPick = Pick<
  SellerOnboarding,
  | "stripeConnectAccountId"
  | "stripeConnectOnboardingComplete"
  | "stripeChargesEnabled"
  | "stripePayoutsEnabled"
> & {
  status?: SellerOnboardingStatus;
  sellerOnboardingStatus?: SellerOnboardingStatus;
};

/** Koper-zichtbare verified business badge (payout-ready + KVK geverifieerd). */
export type BuyerVisibleSellerPick = SellerPayoutReadyPick & {
  sellerType?: SellerType | null;
  kvkVerifiedAt?: string | null;
  /** Alias wanneer data uit ProductSeller komt. */
  sellerOnboardingStatus?: SellerOnboardingStatus;
};

function resolveSellerStatus(
  seller: BuyerVisibleSellerPick | SellerOnboarding | SellerPayoutReadyPick
): SellerOnboardingStatus {
  if ("status" in seller && seller.status) {
    return seller.status;
  }
  if ("sellerOnboardingStatus" in seller && seller.sellerOnboardingStatus) {
    return seller.sellerOnboardingStatus;
  }
  return "not_started";
}

/** Alle Stripe/seller-voorwaarden voor live verkoop en publiceren. */
export function isSellerPayoutReadyForSales(
  onboarding:
    | SellerPayoutReadyPick
    | BuyerVisibleSellerPick
    | SellerOnboarding
    | null
    | undefined
): boolean {
  if (!onboarding) {
    return false;
  }
  const status = resolveSellerStatus(onboarding);
  const accountId = (onboarding.stripeConnectAccountId ?? "").trim();
  return (
    status === "verified" &&
    accountId.startsWith("acct_") &&
    onboarding.stripeConnectOnboardingComplete === true &&
    onboarding.stripeChargesEnabled === true &&
    onboarding.stripePayoutsEnabled === true
  );
}

export function isVerifiedBusinessSellerForBuyers(
  seller: BuyerVisibleSellerPick | SellerOnboarding | null | undefined
): boolean {
  if (!seller) {
    return false;
  }
  if (seller.sellerType && seller.sellerType !== "business") {
    return false;
  }
  return isSellerPayoutReadyForSales(seller) && !!seller.kvkVerifiedAt;
}

export function getPublicSellerBusinessName(
  seller: {
    businessName?: string | null;
    displayName?: string | null;
    username?: string | null;
  },
  verifiedBusiness: boolean
): string {
  if (verifiedBusiness) {
    const business = clean(seller.businessName);
    if (business) {
      return business;
    }
  }
  return clean(seller.displayName) || clean(seller.username) || "Verkoper";
}

export function formatPublicBusinessLocation(
  seller: Pick<
    SellerOnboarding,
    "businessCity" | "businessPostalCode" | "businessCountry"
  >
): string | null {
  const parts = [
    clean(seller.businessCity),
    clean(seller.businessPostalCode),
    clean(seller.businessCountry),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Verkoper mag officiële uitbetalingen ontvangen (live-modus). */
export function canSellerReceivePayments(
  onboarding: SellerPayoutReadyPick | SellerOnboarding | null | undefined
): boolean {
  return isSellerPayoutReadyForSales(onboarding);
}

/** Account handmatig goedgekeurd voor verkoop. */
export function isSellerVerified(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return onboarding?.status === "verified";
}

/** Producten publiceren (actief zetten) — zelfde eisen als checkout. */
export function canSellerManageProducts(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return isSellerPayoutReadyForSales(onboarding);
}

/** Concept/draft voorbereiden in eigen shop (zonder publieke activering). */
export function canSellerPrepareProducts(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return onboarding?.sellerType === "business";
}

/** Echte verkoop/checkout — verified + volledige Stripe Connect. */
export function canSellerAcceptSales(
  onboarding: SellerPayoutReadyPick | SellerOnboarding | null | undefined
): boolean {
  return isSellerPayoutReadyForSales(onboarding);
}

export function hasCompletedStripePayoutSetup(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return hasCompletedStripeOnboardingForm(onboarding);
}

export { hasCompletedStripeOnboardingForm };

export function isStripePayoutFullyActive(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return isStripeConnectPayoutReady(onboarding);
}

/** Ideale live-verkoop: verified + Stripe Connect volledig actief. */
export function isSellerFullyReadyForLiveSales(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return isSellerPayoutReadyForSales(onboarding);
}

export function getKvkStatusLabel(
  onboarding: SellerOnboarding | null | undefined
): string {
  if (!onboarding || onboarding.sellerType !== "business") {
    return "Niet van toepassing";
  }
  if (onboarding.kvkVerifiedAt) {
    return "Geverifieerd";
  }
  if (onboarding.kvkNumber) {
    return "Ingediend";
  }
  return "Nog invullen";
}

function verificationStatusLabel(
  status: SellerOnboardingStatus
): string {
  switch (status) {
    case "not_started":
      return "Nog niet gestart";
    case "needs_business_info":
      return "Gegevens aanvullen";
    case "pending_review":
      return "In controle";
    case "verified":
      return "Goedgekeurd";
    case "rejected":
      return "Afgewezen";
    default:
      return "Onbekend";
  }
}

export function getSalesStatusLabel(
  onboarding: SellerOnboarding | null | undefined
): string {
  if (!onboarding) {
    return "Nog niet actief";
  }
  if (isSellerFullyReadyForLiveSales(onboarding)) {
    return "Actief";
  }
  if (isSellerVerified(onboarding)) {
    return "Goedgekeurd — Stripe nog afronden";
  }
  return "Nog niet actief";
}

function kontroleStatusLabel(
  status: SellerOnboardingStatus
): string {
  if (status === "verified") {
    return "Goedgekeurd";
  }
  if (status === "pending_review") {
    return "In controle";
  }
  if (status === "rejected") {
    return "Afgewezen";
  }
  return "Nog niet ingediend";
}

function bedrijfsgegevensStatusLabel(
  onboarding: SellerOnboarding
): string {
  if (onboarding.status === "verified" || onboarding.status === "pending_review") {
    return "Ingediend";
  }
  if (onboarding.sellerType === "business") {
    return getKvkStatusLabel(onboarding);
  }
  return verificationStatusLabel(onboarding.status);
}

export function getSellerOnboardingDashboardLines(
  onboarding: SellerOnboarding
): string[] {
  return [
    `KVK & bedrijfsgegevens: ${bedrijfsgegevensStatusLabel(onboarding)}`,
    `Stripe uitbetalingen: ${sellerPayoutStatusLabel(onboarding)}`,
    `Controle: ${kontroleStatusLabel(onboarding.status)}`,
    `Verkoop actief: ${getSalesStatusLabel(onboarding)}`,
  ];
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
  if (isStripePayoutFullyActive(onboarding)) {
    return "Uitbetalingen actief";
  }
  if (onboarding.stripeConnectOnboardingComplete) {
    return "Stripe controleert je gegevens";
  }
  if (onboarding.stripeConnectAccountId) {
    return "Doorgaan met uitbetalingen instellen";
  }
  return "Uitbetalingen instellen";
}

export type SellerStatusCardContent = {
  title: string;
  message: string;
  buttonLabel: string;
  tone: "default" | "success" | "warning" | "danger";
};

export type SellerDashboardUI = {
  title: string;
  message: string;
  buttonLabel: string;
  tone: "default" | "success" | "warning" | "danger";
  showPayoutManage?: boolean;
};

function hasStripeRequirementsDue(onboarding: SellerOnboarding): boolean {
  return onboarding.stripeRequirementsCurrentlyDue.length > 0;
}

/** UI-teksten voor seller dashboard (geen nepclaims over bankverificatie). */
export function resolveSellerDashboardUI(
  onboarding: SellerOnboarding | null | undefined
): SellerDashboardUI {
  if (!onboarding || onboarding.status === "not_started") {
    return {
      title: "Stel je verkoopaccount in",
      message:
        "Vul je bedrijfsgegevens in en rond Stripe-verificatie af voordat je kunt verkopen.",
      buttonLabel: "Start verificatie",
      tone: "default",
    };
  }

  if (onboarding.status === "rejected") {
    return {
      title: "Verificatie afgewezen",
      message:
        onboarding.sellerRejectionReason?.trim() ||
        "Je gegevens voldoen nog niet. Pas je gegevens aan en probeer opnieuw.",
      buttonLabel: "Gegevens aanpassen",
      tone: "danger",
    };
  }

  if (isSellerFullyReadyForLiveSales(onboarding)) {
    return {
      title: "Je verkoopaccount is actief",
      message:
        "Uitbetalingen gaan veilig via Stripe naar je opgegeven rekening.",
      buttonLabel: "Verkoopaccount bekijken",
      tone: "success",
      showPayoutManage: true,
    };
  }

  if (
    onboarding.sellerType === "business" &&
    onboarding.kvkNumber &&
    !onboarding.kvkVerifiedAt
  ) {
    return {
      title: "Vul je bedrijfsgegevens aan",
      message:
        "Je KVK-gegevens moeten worden geverifieerd voordat je kunt verkopen.",
      buttonLabel: "Bedrijfsgegevens invullen",
      tone: "warning",
    };
  }

  if (hasStripeRequirementsDue(onboarding)) {
    return {
      title: "Stripe heeft aanvullende gegevens nodig",
      message:
        "Rond je Stripe-verificatie af. Uitbetalingen worden verwerkt via Stripe.",
      buttonLabel: "Open Stripe om dit af te ronden",
      tone: "warning",
      showPayoutManage: true,
    };
  }

  if (
    onboarding.stripeConnectAccountId &&
    !isStripePayoutFullyActive(onboarding)
  ) {
    return {
      title: "Rond je Stripe-verificatie af",
      message:
        "Stripe controleert je gegevens of wacht op aanvullende informatie. Uitbetalingen worden verwerkt via Stripe.",
      buttonLabel: "Doorgaan met Stripe",
      tone: "warning",
      showPayoutManage: true,
    };
  }

  if (!onboarding.stripeConnectAccountId) {
    return {
      title: "Stel je verkoopaccount in",
      message:
        "Koppel Stripe om betalingen en uitbetalingen veilig te regelen. Kwaapo slaat geen bankgegevens op.",
      buttonLabel: "Uitbetalingen instellen",
      tone: "default",
    };
  }

  return {
    title: "Verkoopaccount nog niet actief",
    message:
      "Rond bedrijfsgegevens en Stripe-verificatie af om te kunnen verkopen.",
    buttonLabel: "Verder met verificatie",
    tone: "warning",
  };
}

export function getSellerStatusCardContent(
  onboarding: SellerOnboarding
): SellerStatusCardContent {
  const ui = resolveSellerDashboardUI(onboarding);
  return {
    title: ui.title,
    message: ui.message,
    buttonLabel: ui.buttonLabel,
    tone: ui.tone,
  };
}

export async function fetchMySellerOnboarding(): Promise<SellerOnboarding | null> {
  // Own full record (incl. PII columns) comes from a SECURITY DEFINER RPC —
  // direct table SELECT no longer exposes sensitive columns (migration 0039).
  const { data, error } = await supabase
    .rpc("get_my_seller_onboarding")
    .maybeSingle<SellerOnboardingRow>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return mapSellerOnboardingRow(data);
}

// Columns a buyer may see about another seller (no PII/secrets). Enough to
// drive canSellerAcceptSales(); sensitive fields stay owner-only (migration 0039).
const SELLER_PUBLIC_COLUMNS =
  "id, seller_onboarding_status, seller_type, business_name, business_country, business_city, display_name, seller_verified_at, seller_rejection_reason, kvk_verified_at, stripe_connect_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled, stripe_requirements_currently_due, stripe_requirements_disabled_reason, stripe_status_updated_at";

export async function fetchSellerOnboardingByProfileId(
  profileId: string
): Promise<SellerOnboarding | null> {
  // Buyer-facing lookup: safe columns only. PII (email/kvk/address/stripe id)
  // is not selected and is no longer readable for other users' profiles.
  const { data, error } = await supabase
    .from("profiles")
    .select(SELLER_PUBLIC_COLUMNS)
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
  logSellerOnboarding("SELLER_ONBOARDING_STEP1_START");
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

  logSellerOnboarding("SELLER_SAVE_TARGET", { target: "rpc:update_my_seller_business_info" });
  logSellerOnboarding("SELLER_SAVE_PAYLOAD_KEYS", {
    keys: [
      "seller_type",
      "business_name",
      "kvk_number",
      "business_email",
      "business_country",
      "business_city",
      "business_postal_code",
      "business_street",
      "business_house_number",
      "kvk_verified_at",
    ],
    sellerType: validated.sellerType,
    hasKvk: !!validated.kvkNumber,
  });
  logSellerOnboarding("SELLER_SAVE_START", { userIdPrefix: userId.slice(0, 8) });

  const { data, error } = await supabase.rpc("update_my_seller_business_info", {
    p_seller_type: validated.sellerType,
    p_business_name: validated.businessName,
    p_kvk_number: validated.kvkNumber ?? null,
    p_vat_number: validated.vatNumber ?? null,
    p_business_email: validated.businessEmail,
    p_business_phone: validated.businessPhone,
    p_business_country: validated.businessCountry,
    p_business_city: validated.businessCity,
    p_business_postal_code: validated.businessPostalCode,
    p_business_street: validated.businessStreet,
    p_business_house_number: validated.businessHouseNumber,
    p_kvk_verified_at: kvkVerifiedAt,
    p_kvk_verification_source: kvkVerificationSource,
  });

  if (error) {
    logSellerSaveErrorDev(error);
    logSellerOnboarding("SELLER_SAVE_ERROR_CODE", {
      code: (error as { code?: string }).code ?? null,
    });
    logSellerOnboarding("SELLER_SAVE_ERROR_MESSAGE", {
      message: error.message?.slice(0, 200) ?? null,
    });
    throw mapSellerSaveError(error);
  }

  const result = (data ?? null) as { success?: boolean; error?: string } | null;
  if (!result?.success) {
    const rpcError = mapSellerRpcError(result?.error);
    logSellerOnboarding("SELLER_SAVE_ERROR_MESSAGE", { message: result?.error ?? null });
    throw new Error(rpcError);
  }

  logSellerOnboarding("SELLER_SAVE_SUCCESS");
  logSellerOnboarding("SELLER_PROFILE_LOOKUP_START");
  const mapped = await fetchMySellerOnboarding();
  logSellerOnboarding("SELLER_PROFILE_LOOKUP_RESULT", { found: !!mapped });
  if (!mapped) {
    throw new Error("Kon je verkopersgegevens niet laden na opslaan.");
  }
  void refreshSellerReadinessFromWorker().catch(() => undefined);
  logSellerOnboarding("SELLER_NAVIGATE_STEP2", {
    nextStep: resolveSellerOnboardingStep(mapped),
  });
  return mapped;
}

export async function markSellerPendingReview(): Promise<SellerOnboarding> {
  await refreshSellerReadinessFromWorker();

  const onboarding = await fetchMySellerOnboarding();
  if (!onboarding) {
    throw new Error("Kon je verkopersgegevens niet laden.");
  }
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

  if (onboarding.status === "verified" && isSellerFullyReadyForLiveSales(onboarding)) {
    return onboarding;
  }

  if (onboarding.status === "verified") {
    return onboarding;
  }

  throw new Error(
    "Je verkoopaccount is nog niet volledig actief. Rond Stripe en bedrijfsgegevens af."
  );
}

/** Server-side readiness herberekenen (Stripe API + profielstatus). */
export async function refreshSellerReadinessFromWorker(): Promise<void> {
  const { refreshStripeConnectStatus } = await import("./stripeConnectService");
  await refreshStripeConnectStatus();
}
