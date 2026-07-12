import type { SellerOnboarding } from "../types/sellerOnboarding";

export type StripeConnectState =
  | "not_started"
  | "onboarding_incomplete"
  | "details_submitted"
  | "pending_verification"
  | "ready"
  | "restricted"
  | "error";

export type StripeConnectSignals = {
  accountId?: string | null;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  onboardingComplete?: boolean;
  requirementsCurrentlyDue?: string[];
  requirementsPastDue?: string[];
  disabledReason?: string | null;
};

export type StripeConnectStepSignals = {
  detailsSubmitted?: boolean;
  onboardingComplete?: boolean;
  requirementsCurrentlyDue?: string[];
};

/** Centrale stap-2→3 regel: formulier ingediend en geen open onboardingvelden. */
export function canProceedToStripeStep3(
  input: StripeConnectStepSignals
): boolean {
  const detailsSubmitted =
    input.detailsSubmitted === true || input.onboardingComplete === true;
  const currentlyDue = input.requirementsCurrentlyDue ?? [];
  return detailsSubmitted && currentlyDue.length === 0;
}

/** Stripe onboarding form afgerond (details_submitted) — voldoende voor stap 3. */
export function hasCompletedStripeOnboardingForm(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  if (!onboarding) {
    return false;
  }
  return canProceedToStripeStep3({
    onboardingComplete: onboarding.stripeConnectOnboardingComplete,
    requirementsCurrentlyDue: onboarding.stripeRequirementsCurrentlyDue,
  });
}

/** Volledig payout-ready: charges + payouts actief. */
export function isStripeConnectPayoutReady(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  if (!onboarding) {
    return false;
  }
  return (
    onboarding.stripeChargesEnabled === true &&
    onboarding.stripePayoutsEnabled === true &&
    hasCompletedStripeOnboardingForm(onboarding)
  );
}

export function resolveStripeConnectState(
  input: StripeConnectSignals
): StripeConnectState {
  const accountId = String(input.accountId ?? "").trim();
  if (!accountId.startsWith("acct_")) {
    return "not_started";
  }

  const detailsSubmitted =
    input.detailsSubmitted === true || input.onboardingComplete === true;
  const chargesEnabled = input.chargesEnabled === true;
  const payoutsEnabled = input.payoutsEnabled === true;
  const currentlyDue = input.requirementsCurrentlyDue ?? [];
  const pastDue = input.requirementsPastDue ?? [];
  const disabledReason = input.disabledReason ?? null;

  if (disabledReason) {
    return "restricted";
  }

  if (chargesEnabled && payoutsEnabled && detailsSubmitted) {
    if (currentlyDue.length > 0 || pastDue.length > 0) {
      return "pending_verification";
    }
    return "ready";
  }

  if (detailsSubmitted) {
    if (currentlyDue.length > 0 || pastDue.length > 0) {
      return "pending_verification";
    }
    return "details_submitted";
  }

  return "onboarding_incomplete";
}

export function resolveStripeConnectStateFromOnboarding(
  onboarding: SellerOnboarding | null | undefined
): StripeConnectState {
  if (!onboarding) {
    return "not_started";
  }
  return resolveStripeConnectState({
    accountId: onboarding.stripeConnectAccountId,
    detailsSubmitted: onboarding.stripeConnectOnboardingComplete,
    onboardingComplete: onboarding.stripeConnectOnboardingComplete,
    chargesEnabled: onboarding.stripeChargesEnabled,
    payoutsEnabled: onboarding.stripePayoutsEnabled,
    requirementsCurrentlyDue: onboarding.stripeRequirementsCurrentlyDue,
    disabledReason: onboarding.stripeRequirementsDisabledReason,
  });
}

/** Stap 2 is klaar zodra het Stripe-formulier is ingediend. */
export function isSellerOnboardingStripeStepComplete(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  return hasCompletedStripeOnboardingForm(onboarding);
}

export function getStripeOnboardingStepButtonLabel(
  onboarding: SellerOnboarding | null | undefined
): string {
  const state = resolveStripeConnectStateFromOnboarding(onboarding);
  if (state === "not_started") {
    return "Uitbetalingen instellen";
  }
  if (state === "ready") {
    return "Status vernieuwen";
  }
  if (state === "details_submitted" || state === "pending_verification") {
    return "Ga verder naar controle";
  }
  return "Doorgaan met uitbetalingen instellen";
}

export function shouldOpenStripeOnboardingLink(
  onboarding: SellerOnboarding | null | undefined
): boolean {
  const state = resolveStripeConnectStateFromOnboarding(onboarding);
  return state === "not_started" || state === "onboarding_incomplete";
}
