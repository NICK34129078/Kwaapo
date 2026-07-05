/** Set false to silence [BuyerShipmentToast] Metro logs in dev. */
export const BUYER_SHIPMENT_TOAST_DEBUG = __DEV__;

export function logBuyerShipmentToast(message: string, ...details: unknown[]): void {
  if (!BUYER_SHIPMENT_TOAST_DEBUG) {
    return;
  }
  if (details.length === 0) {
    console.log(`[BuyerShipmentToast] ${message}`);
    return;
  }
  console.log(`[BuyerShipmentToast] ${message}`, ...details);
}
