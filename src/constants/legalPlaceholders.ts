/**
 * Placeholders voor juridische en bedrijfsgegevens.
 * Vul deze in vóór publieke release — niet committen als definitieve waarden zonder juridische check.
 */
export const LEGAL_PLACEHOLDERS = {
  LEGAL_NAME: "[JURIDISCHE BEDRIJFSNAAM]",
  TRADE_NAME: "[HANDELSNAAM]",
  KVK: "[KVK-NUMMER]",
  ADDRESS: "[VESTIGINGSADRES]",
  CONTACT_EMAIL: "[CONTACT-E-MAIL]",
  COMPLAINTS_EMAIL: "[KLACHTEN-E-MAIL]",
  EFFECTIVE_DATE: "[INGANGSDATUM]",
  VERSION: "[VERSIENUMMER]",
} as const;

export const LEGAL_PLACEHOLDER_VALUES = Object.values(LEGAL_PLACEHOLDERS);
