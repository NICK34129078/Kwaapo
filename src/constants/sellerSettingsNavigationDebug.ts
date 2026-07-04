/** Set false to silence [SellerSettingsNavigation] Metro logs in dev. */
export const SELLER_SETTINGS_NAVIGATION_DEBUG = __DEV__;

export function logSellerSettingsNavigation(
  message: string,
  ...details: unknown[]
): void {
  if (!SELLER_SETTINGS_NAVIGATION_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[SellerSettingsNavigation] ${message}`);
    return;
  }
  console.log(`[SellerSettingsNavigation] ${message}`, ...details);
}
