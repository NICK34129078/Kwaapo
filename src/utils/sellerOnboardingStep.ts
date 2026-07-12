import type { SellerOnboarding } from "../types/sellerOnboarding";
import {
  canProceedToStripeStep3,
  hasCompletedStripeOnboardingForm,
} from "./stripeConnectState";

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
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
  if (!hasCompletedStripeOnboardingForm(onboarding)) {
    return 2;
  }
  return 3;
}
