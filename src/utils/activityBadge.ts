/**
 * Bottom-nav Activity badge: hide while the Activity tab is focused/open.
 */
export function resolveActivityTabBadgeCount(
  unreadSocialCount: number,
  isActivityTabActive: boolean
): number {
  if (isActivityTabActive || unreadSocialCount <= 0) {
    return 0;
  }
  return unreadSocialCount;
}
