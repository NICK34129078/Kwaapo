/** Pure idempotent Stripe Connect account resolution (mirrors worker ensureConnectAccount). */
export function resolveStripeConnectAccountId(
  existingAccountId: string | null | undefined,
  createdAccountId: string
): { accountId: string; reused: boolean; created: boolean } {
  const existing = String(existingAccountId ?? "").trim();
  if (existing.startsWith("acct_")) {
    return { accountId: existing, reused: true, created: false };
  }
  const created = String(createdAccountId ?? "").trim();
  return {
    accountId: created,
    reused: false,
    created: created.startsWith("acct_"),
  };
}
