export type CheckoutAddressDraft = {
  buyerFullName: string;
  buyerEmail: string;
  shippingCountry: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingStreet: string;
  shippingHouseNumber: string;
  shippingPhone?: string | null;
};

export type CheckoutAddressField =
  | "buyerFullName"
  | "buyerEmail"
  | "shippingCountry"
  | "shippingCity"
  | "shippingPostalCode"
  | "shippingStreet"
  | "shippingHouseNumber"
  | "shippingPhone"
  | "_form";

export type CheckoutAddressFieldErrors = Partial<Record<CheckoutAddressField, string>>;

const PDOK_FREE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function normalizeDutchPostcode(value: string): string {
  const compact = clean(value).replace(/\s+/g, "").toUpperCase();
  if (compact.length <= 4) {
    return compact;
  }
  return `${compact.slice(0, 4)} ${compact.slice(4, 6)}`;
}

export function isNetherlandsCountry(country: string): boolean {
  const normalized = clean(country).toLowerCase();
  return (
    normalized === "nederland" ||
    normalized === "netherlands" ||
    normalized === "nl" ||
    normalized === "the netherlands"
  );
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value).toLowerCase());
}

export function isValidDutchPostcodeFormat(value: string): boolean {
  return /^\d{4}\s?[A-Z]{2}$/i.test(clean(value).replace(/\s+/g, " ").toUpperCase());
}

export function isValidHouseNumber(value: string): boolean {
  const trimmed = clean(value);
  if (!trimmed) {
    return false;
  }
  return /^\d+[\s\-]?[a-zA-Z0-9]*$/.test(trimmed);
}

function normalizeStreetKey(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeCityKey(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function citiesMatch(expected: string, actual: string): boolean {
  const a = normalizeCityKey(expected);
  const b = normalizeCityKey(actual);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function streetsMatch(expected: string, actual: string): boolean {
  const a = normalizeStreetKey(expected);
  const b = normalizeStreetKey(actual);
  if (!a || !b) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

export function parseHouseNumber(value: string): {
  huisnummer: string;
  huisletter: string;
  toevoeging: string;
} {
  const trimmed = clean(value);
  const match = trimmed.match(/^(\d+)(?:\s*[-]?\s*([a-zA-Z]))?(?:\s*(.+))?$/);
  if (!match) {
    return { huisnummer: trimmed.replace(/\D/g, ""), huisletter: "", toevoeging: "" };
  }
  return {
    huisnummer: match[1] ?? "",
    huisletter: (match[2] ?? "").toUpperCase(),
    toevoeging: clean(match[3] ?? ""),
  };
}

type PdokDoc = {
  type?: string;
  straatnaam?: string;
  woonplaatsnaam?: string;
  postcode?: string;
  huisnummer?: number | string;
  huisletter?: string;
  huisnummertoevoeging?: string;
};

function pickBestPdokDoc(docs: PdokDoc[], houseNumber: string): PdokDoc | null {
  const parsed = parseHouseNumber(houseNumber);
  const matches = docs.filter((doc) => doc.type === "adres" && doc.straatnaam);
  if (matches.length === 0) {
    return null;
  }

  const exact = matches.find((doc) => {
    const num = String(doc.huisnummer ?? "");
    const letter = clean(doc.huisletter).toUpperCase();
    const toevoeging = clean(doc.huisnummertoevoeging).toLowerCase();
    if (num !== parsed.huisnummer) {
      return false;
    }
    if (parsed.huisletter && letter && letter !== parsed.huisletter) {
      return false;
    }
    if (parsed.toevoeging && toevoeging && toevoeging !== parsed.toevoeging.toLowerCase()) {
      return false;
    }
    return true;
  });

  return exact ?? matches[0] ?? null;
}

/** Synchrone formaat- en verplichtveld-checks (geen adres-lookup). */
export function validateCheckoutAddressSync(
  draft: CheckoutAddressDraft
): CheckoutAddressFieldErrors {
  const errors: CheckoutAddressFieldErrors = {};
  const buyerFullName = clean(draft.buyerFullName);
  const buyerEmail = clean(draft.buyerEmail).toLowerCase();
  const shippingCountry = clean(draft.shippingCountry);
  const shippingCity = clean(draft.shippingCity);
  const shippingPostalCode = clean(draft.shippingPostalCode);
  const shippingStreet = clean(draft.shippingStreet);
  const shippingHouseNumber = clean(draft.shippingHouseNumber);
  const shippingPhone = clean(draft.shippingPhone);

  if (buyerFullName.length < 3) {
    errors.buyerFullName = "Vul je volledige naam in.";
  } else if (!/\s/.test(buyerFullName)) {
    errors.buyerFullName = "Vul voor- en achternaam in.";
  }

  if (!buyerEmail) {
    errors.buyerEmail = "Vul je e-mailadres in.";
  } else if (!isValidEmail(buyerEmail)) {
    errors.buyerEmail = "Vul een geldig e-mailadres in.";
  }

  if (!shippingCountry) {
    errors.shippingCountry = "Vul je land in.";
  }

  if (shippingCity.length < 2) {
    errors.shippingCity = "Vul een geldige plaats in.";
  }

  if (isNetherlandsCountry(shippingCountry)) {
    if (!isValidDutchPostcodeFormat(shippingPostalCode)) {
      errors.shippingPostalCode = "Vul een geldige Nederlandse postcode in (bijv. 1234 AB).";
    }
  } else if (shippingPostalCode.length < 3) {
    errors.shippingPostalCode = "Vul een geldige postcode in.";
  }

  if (shippingStreet.length < 2 || !/[a-zA-Z]/.test(shippingStreet)) {
    errors.shippingStreet = "Vul een geldige straatnaam in.";
  }

  if (!isValidHouseNumber(shippingHouseNumber)) {
    errors.shippingHouseNumber = "Vul een geldig huisnummer in.";
  }

  if (shippingPhone && shippingPhone.replace(/\D/g, "").length < 8) {
    errors.shippingPhone = "Vul een geldig telefoonnummer in of laat leeg.";
  }

  return errors;
}

export function isCheckoutAddressSyncValid(errors: CheckoutAddressFieldErrors): boolean {
  return Object.keys(errors).length === 0;
}

/** Controleert NL-adressen tegen BAG via PDOK (gratis, geen API-key). */
export async function verifyDutchShippingAddress(
  draft: CheckoutAddressDraft
): Promise<CheckoutAddressFieldErrors> {
  if (!isNetherlandsCountry(draft.shippingCountry)) {
    return {};
  }

  const syncErrors = validateCheckoutAddressSync(draft);
  if (!isCheckoutAddressSyncValid(syncErrors)) {
    return syncErrors;
  }

  const postcode = normalizeDutchPostcode(draft.shippingPostalCode).replace(/\s+/g, "");
  const parsed = parseHouseNumber(draft.shippingHouseNumber);
  const params = new URLSearchParams();
  params.append("fq", `postcode:${postcode}`);
  params.append("fq", `huisnummer:${parsed.huisnummer}`);
  params.append("fq", "type:adres");
  params.set(
    "fl",
    "straatnaam,woonplaatsnaam,postcode,huisnummer,huisletter,huisnummertoevoeging,type"
  );
  params.set("rows", "10");
  params.set("start", "0");

  let response: Response;
  try {
    response = await fetch(`${PDOK_FREE_URL}?${params.toString()}`);
  } catch {
    return {
      _form: "Adres kon niet worden gecontroleerd. Controleer je internet en probeer opnieuw.",
    };
  }

  if (!response.ok) {
    return {
      _form: "Adres kon niet worden gecontroleerd. Probeer het later opnieuw.",
    };
  }

  const payload = (await response.json()) as {
    response?: { docs?: PdokDoc[] };
  };
  const docs = payload.response?.docs ?? [];
  const match = pickBestPdokDoc(docs, draft.shippingHouseNumber);

  if (!match?.straatnaam || !match.woonplaatsnaam) {
    return {
      shippingPostalCode: "Dit adres bestaat niet. Controleer postcode en huisnummer.",
      shippingHouseNumber: "Dit adres bestaat niet. Controleer postcode en huisnummer.",
    };
  }

  const errors: CheckoutAddressFieldErrors = {};

  if (!streetsMatch(draft.shippingStreet, match.straatnaam)) {
    errors.shippingStreet = `Straat klopt niet bij dit adres. Bedoel je ${match.straatnaam}?`;
  }

  if (!citiesMatch(draft.shippingCity, match.woonplaatsnaam)) {
    errors.shippingCity = `Plaats klopt niet bij dit adres. Bedoel je ${match.woonplaatsnaam}?`;
  }

  return errors;
}

export async function validateCheckoutAddressForPayment(
  draft: CheckoutAddressDraft
): Promise<CheckoutAddressFieldErrors> {
  const syncErrors = validateCheckoutAddressSync(draft);
  if (!isCheckoutAddressSyncValid(syncErrors)) {
    return syncErrors;
  }

  if (isNetherlandsCountry(draft.shippingCountry)) {
    return verifyDutchShippingAddress(draft);
  }

  return {};
}

export function formatCheckoutAddressDraft(draft: CheckoutAddressDraft): CheckoutAddressDraft {
  return {
    ...draft,
    buyerFullName: clean(draft.buyerFullName),
    buyerEmail: clean(draft.buyerEmail).toLowerCase(),
    shippingCountry: clean(draft.shippingCountry),
    shippingCity: clean(draft.shippingCity),
    shippingPostalCode: isNetherlandsCountry(draft.shippingCountry)
      ? normalizeDutchPostcode(draft.shippingPostalCode)
      : clean(draft.shippingPostalCode).toUpperCase(),
    shippingStreet: clean(draft.shippingStreet),
    shippingHouseNumber: clean(draft.shippingHouseNumber),
    shippingPhone: clean(draft.shippingPhone) || null,
  };
}
