/** Activity / notification tab badges (cap at 99+). */
export function formatNotificationBadgeCount(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  if (count >= 99) {
    return "99+";
  }
  return String(count);
}
