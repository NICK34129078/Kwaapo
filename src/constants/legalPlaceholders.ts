/**
 * Placeholders voor juridische en bedrijfsgegevens.
 * Vul deze in vóór publieke release — niet committen als definitieve waarden zonder juridische check.
 */
export const LEGAL_PLACEHOLDERS = {
  LEGAL_NAME: "[JURIDISCHE BEDRIJFSNAAM]",
  TRADE_NAME: "[HANDELSNAAM]",
  KVK: "[KVK-NUMMER]",
  ADDRESS: "[VESTIGINGSADRES]",
  PRIVACY_EMAIL: "[PRIVACY-E-MAIL]",
  CONTACT_EMAIL: "[CONTACT-E-MAIL]",
  COMPLAINTS_EMAIL: "[KLACHTEN-E-MAIL]",
  EFFECTIVE_DATE: "[INGANGSDATUM]",
  VERSION: "[VERSIENUMMER]",
  EU_REPRESENTATIVE: "[EU-VERTEGENWOORDIGER INDIEN VAN TOEPASSING]",
  DPO: "[FUNCTIONARIS GEGEVENSBESCHERMING INDIEN VAN TOEPASSING]",
  WEB_DOMAIN: "[DOMEIN]",
} as const;

/** Bewaartermijn-placeholders — vul in na juridische/fiscale afstemming. */
export const RETENTION_PLACEHOLDERS = {
  ACCOUNT_ACTIVE: "[BEWAARTERMIJN: account zolang actief]",
  DELETED_ACCOUNT: "[BEWAARTERMIJN: verwijderde accounts]",
  POSTS_MEDIA: "[BEWAARTERMIJN: posts en media]",
  INTERACTIONS: "[BEWAARTERMIJN: likes, reacties, follows]",
  RANKING: "[BEWAARTERMIJN: ranking- en kijkgegevens]",
  REPORTS: "[BEWAARTERMIJN: meldingen en moderatie]",
  SUPPORT: "[BEWAARTERMIJN: supportberichten]",
  SECURITY_LOGS: "[BEWAARTERMIJN: beveiligingslogs]",
  ORDERS: "[BEWAARTERMIJN: betaalde orders]",
  FISCAL: "[BEWAARTERMIJN: fiscale administratie]",
  STRIPE: "[BEWAARTERMIJN: Stripe-referenties]",
  BACKUPS: "[BEWAARTERMIJN: back-ups]",
} as const;

export const LEGAL_ENTITY_PLACEHOLDER_VALUES = Object.values(LEGAL_PLACEHOLDERS);

/** Placeholders die in gebruikersvoorwaarden voorkomen. */
export const TERMS_REQUIRED_PLACEHOLDERS = [
  LEGAL_PLACEHOLDERS.LEGAL_NAME,
  LEGAL_PLACEHOLDERS.TRADE_NAME,
  LEGAL_PLACEHOLDERS.KVK,
  LEGAL_PLACEHOLDERS.ADDRESS,
  LEGAL_PLACEHOLDERS.CONTACT_EMAIL,
  LEGAL_PLACEHOLDERS.COMPLAINTS_EMAIL,
  LEGAL_PLACEHOLDERS.EFFECTIVE_DATE,
  LEGAL_PLACEHOLDERS.VERSION,
] as const;

export const RETENTION_PLACEHOLDER_VALUES = Object.values(RETENTION_PLACEHOLDERS);

/** Alle placeholders voor privacy-release-checklist. */
export const LEGAL_PLACEHOLDER_VALUES = [
  ...LEGAL_ENTITY_PLACEHOLDER_VALUES,
  ...RETENTION_PLACEHOLDER_VALUES,
];
