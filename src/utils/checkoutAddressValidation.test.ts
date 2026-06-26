import {
  isCheckoutAddressSyncValid,
  isValidDutchPostcodeFormat,
  isValidEmail,
  normalizeDutchPostcode,
  parseHouseNumber,
  validateCheckoutAddressSync,
} from "./checkoutAddressValidation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const validDraft = {
  buyerFullName: "Nick van Dullemen",
  buyerEmail: "nick@example.nl",
  shippingCountry: "Nederland",
  shippingCity: "Amsterdam",
  shippingPostalCode: "1012 AB",
  shippingStreet: "Damrak",
  shippingHouseNumber: "1",
  shippingPhone: "",
};

export function runCheckoutAddressValidationTests(): void {
  assert(normalizeDutchPostcode("1012ab") === "1012 AB", "postcode normaliseren");
  assert(isValidDutchPostcodeFormat("1012 AB"), "postcode formaat geldig");
  assert(!isValidDutchPostcodeFormat("1012"), "postcode te kort");
  assert(isValidEmail("nick@example.nl"), "email geldig");
  assert(!isValidEmail("geen-email"), "email ongeldig");
  assert(parseHouseNumber("12a").huisnummer === "12", "huisnummer parse");
  assert(parseHouseNumber("12a").huisletter === "A", "huisletter parse");

  const ok = validateCheckoutAddressSync(validDraft);
  assert(isCheckoutAddressSyncValid(ok), "geldig adres geen sync errors");

  const badStreet = validateCheckoutAddressSync({ ...validDraft, shippingStreet: "X" });
  assert(!!badStreet.shippingStreet, "te korte straat afkeuren");

  const badName = validateCheckoutAddressSync({ ...validDraft, buyerFullName: "Nick" });
  assert(!!badName.buyerFullName, "alleen voornaam afkeuren");
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  runCheckoutAddressValidationTests();
}
