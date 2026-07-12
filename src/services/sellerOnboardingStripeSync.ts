import { logSellerOnboarding } from "../constants/sellerOnboardingDebug";
import { fetchMySellerOnboarding } from "./sellerOnboardingService";
import {
  refreshStripeConnectStatus,
  type StripeConnectStatus,
} from "./stripeConnectService";
import type { SellerOnboarding } from "../types/sellerOnboarding";
import { canProceedToStripeStep3 } from "../utils/stripeConnectState";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type SellerStripeSyncResult = {
  onboarding: SellerOnboarding | null;
  status: StripeConnectStatus | null;
  canProceedToStep3: boolean;
};

function canProceedFromStatus(status: StripeConnectStatus | null): boolean {
  if (!status) {
    return false;
  }
  return (
    status.canProceedToStep3 === true ||
    canProceedToStripeStep3({
      detailsSubmitted: status.detailsSubmitted,
      requirementsCurrentlyDue: status.requirementsCurrentlyDue,
    })
  );
}

/**
 * Pull latest Stripe Connect status into Supabase, then re-read owner profile.
 * Retries briefly because Stripe test/sandbox can lag after onboarding redirect.
 */
export async function syncSellerOnboardingAfterStripe(
  options: { maxAttempts?: number; delayMs?: number } = {}
): Promise<SellerStripeSyncResult> {
  const maxAttempts = options.maxAttempts ?? 4;
  const delayMs = options.delayMs ?? 800;

  logSellerOnboarding("STRIPE_ONBOARDING_SYNC_START", { maxAttempts });

  let lastRow: SellerOnboarding | null = null;
  let lastStatus: StripeConnectStatus | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logSellerOnboarding("STRIPE_ONBOARDING_SYNC_ATTEMPT", { attempt });

    try {
      lastStatus = await refreshStripeConnectStatus();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Stripe-status ophalen mislukt";
      logSellerOnboarding("STRIPE_STATUS_SYNC_ERROR_MESSAGE", { attempt, message });
      if (attempt === maxAttempts) {
        throw e;
      }
      await sleep(delayMs);
      continue;
    }

    lastRow = await fetchMySellerOnboarding();

    if (canProceedFromStatus(lastStatus) || hasCompletedStripeRow(lastRow)) {
      logSellerOnboarding("STRIPE_ONBOARDING_SYNC_SUCCESS", {
        attempt,
        canProceedToStep3: canProceedFromStatus(lastStatus),
      });
      return {
        onboarding: lastRow,
        status: lastStatus,
        canProceedToStep3:
          canProceedFromStatus(lastStatus) || hasCompletedStripeRow(lastRow),
      };
    }

    if (attempt < maxAttempts) {
      await sleep(delayMs);
    }
  }

  const canProceed =
    canProceedFromStatus(lastStatus) || hasCompletedStripeRow(lastRow);

  logSellerOnboarding("STRIPE_ONBOARDING_SYNC_DONE", {
    canProceedToStep3: canProceed,
  });

  return {
    onboarding: lastRow ?? (await fetchMySellerOnboarding()),
    status: lastStatus,
    canProceedToStep3: canProceed,
  };
}

function hasCompletedStripeRow(row: SellerOnboarding | null): boolean {
  if (!row) {
    return false;
  }
  return canProceedToStripeStep3({
    onboardingComplete: row.stripeConnectOnboardingComplete,
    requirementsCurrentlyDue: row.stripeRequirementsCurrentlyDue,
  });
}
