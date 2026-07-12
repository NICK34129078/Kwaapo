import test from "node:test";
import assert from "node:assert/strict";

import { resolveSellerOnboardingStep } from "./sellerOnboardingStep";
import type { SellerOnboarding } from "../types/sellerOnboarding";
import {
  canProceedToStripeStep3,
  getStripeOnboardingStepButtonLabel,
  hasCompletedStripeOnboardingForm,
  resolveStripeConnectState,
  resolveStripeConnectStateFromOnboarding,
  shouldOpenStripeOnboardingLink,
} from "./stripeConnectState";

function baseOnboarding(
  overrides: Partial<SellerOnboarding> = {}
): SellerOnboarding {
  return {
    profileId: "user-1",
    status: "needs_business_info",
    sellerType: "business",
    businessName: "Kwaapo B.V.",
    kvkNumber: "12345678",
    vatNumber: null,
    businessEmail: "info@kwaapo.nl",
    businessPhone: null,
    businessCountry: "Nederland",
    businessCity: "Amsterdam",
    businessPostalCode: "1012AB",
    businessStreet: "Damrak",
    businessHouseNumber: "1",
    stripeConnectAccountId: null,
    stripeConnectOnboardingComplete: false,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
    stripeRequirementsCurrentlyDue: [],
    stripeRequirementsDisabledReason: null,
    stripeStatusUpdatedAt: null,
    sellerVerifiedAt: null,
    sellerRejectionReason: null,
    displayName: null,
    kvkVerifiedAt: null,
    kvkVerificationSource: null,
    ...overrides,
  };
}

test("resolveStripeConnectState: not_started without account", () => {
  assert.equal(resolveStripeConnectState({ accountId: null }), "not_started");
});

test("resolveStripeConnectState: onboarding_incomplete with account only", () => {
  assert.equal(
    resolveStripeConnectState({
      accountId: "acct_123",
      detailsSubmitted: false,
    }),
    "onboarding_incomplete"
  );
});

test("resolveStripeConnectState: details_submitted after form complete", () => {
  assert.equal(
    resolveStripeConnectState({
      accountId: "acct_123",
      detailsSubmitted: true,
      chargesEnabled: false,
      payoutsEnabled: false,
    }),
    "details_submitted"
  );
});

test("resolveStripeConnectState: ready when charges and payouts enabled", () => {
  assert.equal(
    resolveStripeConnectState({
      accountId: "acct_123",
      detailsSubmitted: true,
      chargesEnabled: true,
      payoutsEnabled: true,
    }),
    "ready"
  );
});

test("resolveStripeConnectState: restricted when disabled_reason set", () => {
  assert.equal(
    resolveStripeConnectState({
      accountId: "acct_123",
      disabledReason: "requirements.past_due",
    }),
    "restricted"
  );
});

test("canProceedToStep3 requires details submitted and no currently due", () => {
  assert.equal(
    canProceedToStripeStep3({
      detailsSubmitted: true,
      requirementsCurrentlyDue: [],
    }),
    true
  );
  assert.equal(
    canProceedToStripeStep3({
      detailsSubmitted: true,
      requirementsCurrentlyDue: ["individual.verification.document"],
    }),
    false
  );
});

test("step 2 complete when onboarding flag true and no open requirements", () => {
  const row = baseOnboarding({
    stripeConnectAccountId: "acct_done",
    stripeConnectOnboardingComplete: true,
    stripeRequirementsCurrentlyDue: [],
  });
  assert.equal(hasCompletedStripeOnboardingForm(row), true);
  assert.equal(resolveSellerOnboardingStep(row), 3);
});

test("step 2 stays when onboarding flag true but requirements still due", () => {
  const row = baseOnboarding({
    stripeConnectAccountId: "acct_pending_req",
    stripeConnectOnboardingComplete: true,
    stripeRequirementsCurrentlyDue: ["individual.verification.document"],
  });
  assert.equal(hasCompletedStripeOnboardingForm(row), false);
  assert.equal(resolveSellerOnboardingStep(row), 2);
});

test("step 2 stays when account exists but onboarding flag false", () => {
  const row = baseOnboarding({
    stripeConnectAccountId: "acct_partial",
    stripeConnectOnboardingComplete: false,
  });
  assert.equal(resolveSellerOnboardingStep(row), 2);
  assert.equal(shouldOpenStripeOnboardingLink(row), true);
  assert.equal(getStripeOnboardingStepButtonLabel(row), "Doorgaan met uitbetalingen instellen");
});

test("button advances to control when form submitted but payouts pending", () => {
  const row = baseOnboarding({
    stripeConnectAccountId: "acct_pending",
    stripeConnectOnboardingComplete: true,
    stripeChargesEnabled: false,
    stripePayoutsEnabled: false,
  });
  assert.equal(resolveStripeConnectStateFromOnboarding(row), "details_submitted");
  assert.equal(shouldOpenStripeOnboardingLink(row), false);
  assert.equal(getStripeOnboardingStepButtonLabel(row), "Ga verder naar controle");
});

test("button refreshes when payouts fully active", () => {
  const row = baseOnboarding({
    stripeConnectAccountId: "acct_ready",
    stripeConnectOnboardingComplete: true,
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
  });
  assert.equal(getStripeOnboardingStepButtonLabel(row), "Status vernieuwen");
});
