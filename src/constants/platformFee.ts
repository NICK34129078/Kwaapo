/** Platformcommissie op order-subtotaal (excl. split payments in Checkout). */
export const PLATFORM_FEE_RATE = 0.125;

export const PLATFORM_FEE_PERCENT_LABEL = "12,5%";

export function computePlatformFeeAmount(subtotalAmount: number): number {
  return Math.round(subtotalAmount * PLATFORM_FEE_RATE * 100) / 100;
}

export function computeSellerAmount(subtotalAmount: number): number {
  const fee = computePlatformFeeAmount(subtotalAmount);
  return Math.round((subtotalAmount - fee) * 100) / 100;
}
