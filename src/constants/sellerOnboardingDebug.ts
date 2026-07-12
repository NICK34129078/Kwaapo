/** Set false to silence seller onboarding dev logs. */
export const SELLER_ONBOARDING_DEBUG = __DEV__;

export function logSellerOnboarding(step: string, detail?: Record<string, unknown>): void {
  if (!SELLER_ONBOARDING_DEBUG) {
    return;
  }
  if (detail) {
    console.log(`[SellerOnboarding] ${step}`, detail);
    return;
  }
  console.log(`[SellerOnboarding] ${step}`);
}
