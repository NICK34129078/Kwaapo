import type { SellerOnboarding } from "../types/sellerOnboarding";
import { CURRENT_SELLER_TERMS_VERSION } from "../constants/sellerTerms";
import {
  canSellerAcceptSales,
  isSellerPayoutReadyForSales,
} from "../services/sellerOnboardingService";

export type CanUserSellInput = {
  onboarding: SellerOnboarding | null | undefined;
  sellerTermsVersion?: string | null;
  moderationSuspendedAt?: string | null;
  accountDeletionStatus?: string | null;
};

export type CanUserSellResult = {
  allowed: boolean;
  reason?: string;
};

/**
 * Eén bron van waarheid: mag deze gebruiker verkopen / actieve listings publiceren?
 */
export function canUserSell(input: CanUserSellInput): CanUserSellResult {
  const { onboarding } = input;

  if (input.accountDeletionStatus === "requested" || input.accountDeletionStatus === "processing") {
    return { allowed: false, reason: "Account wordt verwijderd." };
  }

  if (input.moderationSuspendedAt) {
    return { allowed: false, reason: "Je account is tijdelijk geschorst." };
  }

  if (!onboarding || onboarding.sellerType !== "business") {
    return { allowed: false, reason: "Business-verkoopaccount vereist." };
  }

  if (!isSellerPayoutReadyForSales(onboarding)) {
    return { allowed: false, reason: "Rond Stripe-uitbetalingen en verificatie af." };
  }

  if (!onboarding.kvkVerifiedAt) {
    return { allowed: false, reason: "KVK-verificatie is vereist." };
  }

  const termsVersion = input.sellerTermsVersion ?? null;
  if (termsVersion !== CURRENT_SELLER_TERMS_VERSION) {
    return { allowed: false, reason: "Accepteer de huidige seller-voorwaarden." };
  }

  if (!canSellerAcceptSales(onboarding)) {
    return { allowed: false, reason: "Verkoopaccount is nog niet actief." };
  }

  return { allowed: true };
}

export function canUserSellFromOnboarding(
  onboarding: SellerOnboarding | null | undefined,
  extras?: Pick<
    CanUserSellInput,
    "sellerTermsVersion" | "moderationSuspendedAt" | "accountDeletionStatus"
  >
): CanUserSellResult {
  return canUserSell({
    onboarding,
    sellerTermsVersion: extras?.sellerTermsVersion ?? null,
    moderationSuspendedAt: extras?.moderationSuspendedAt ?? null,
    accountDeletionStatus: extras?.accountDeletionStatus ?? null,
  });
}
