/** Shared seller open-order badge label (Profile tab, gear, Settings). */
export function formatSellerOrderBadgeCount(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count > 9 ? "9+" : String(count);
}
