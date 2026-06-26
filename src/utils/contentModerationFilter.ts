/**
 * Verboden woorden/patronen — client-side waarschuwing, geen vervanging voor moderatie.
 * TODO(juridisch): review lijst vóór livegang.
 */

const BLOCKED_WORDS = [
  "kinderporno",
  "cp",
  "cocaine",
  "heroine",
  "meth",
  "vuurwapen",
  "handgranaat",
  "neppe id",
  "bankpas te koop",
  "gestolen iphone",
] as const;

const SCAM_PATTERNS = [
  /\bwhatsapp\s*\+\d/i,
  /\btelegram\s*@\w+/i,
  /\b(stuur|pay|betaal)\s*(eerst|voorschot)\b/i,
  /\b(crypto|bitcoin)\s*(dubbel|100%)\b/i,
  /\bgratis\s*iphone\b/i,
  /\bclick\s*here\b.*\bhttp/i,
] as const;

const URL_PATTERN = /https?:\/\/[^\s]+/gi;

export type ContentModerationResult =
  | { ok: true }
  | { ok: false; severity: "block" | "warn"; message: string };

function normalize(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

export function moderateUserText(
  input: string,
  context: "caption" | "username" | "product_title" | "product_description" | "bio"
): ContentModerationResult {
  const text = normalize(input);
  if (text.length === 0) {
    return { ok: true };
  }

  for (const word of BLOCKED_WORDS) {
    if (text.includes(word)) {
      return {
        ok: false,
        severity: "block",
        message:
          "Deze tekst bevat woorden die niet zijn toegestaan. Pas je tekst aan of neem contact op met support.",
      };
    }
  }

  for (const pattern of SCAM_PATTERNS) {
    if (pattern.test(input)) {
      return {
        ok: false,
        severity: "warn",
        message:
          "Deze tekst lijkt op spam of oplichting. Externe betaalverzoeken buiten de app zijn niet toegestaan.",
      };
    }
  }

  const urls = input.match(URL_PATTERN) ?? [];
  if (urls.length > 2 && (context === "product_description" || context === "caption")) {
    return {
      ok: false,
      severity: "warn",
      message: "Te veel links in je tekst. Verminder het aantal URL’s.",
    };
  }

  if (context === "username" && URL_PATTERN.test(input)) {
    return {
      ok: false,
      severity: "block",
      message: "Gebruikersnamen mogen geen URL bevatten.",
    };
  }

  return { ok: true };
}

/** Strip control chars; geen HTML rendering in app. */
export function sanitizePlainText(input: string, maxLength = 5000): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLength);
}

export const PROHIBITED_PRODUCT_KEYWORDS = [
  "vuurwapen",
  "pistool",
  "munitie",
  "cocaïne",
  "cocaine",
  "heroïne",
  "heroine",
  "xtc",
  "mdma",
  "nep rolex",
  "replica louis",
  "gestolen",
  "bankpas",
  "identiteitskaart",
  "rijbewijs te koop",
] as const;

export function checkProhibitedProductListing(name: string, description: string): string | null {
  const combined = normalize(`${name} ${description}`);
  for (const keyword of PROHIBITED_PRODUCT_KEYWORDS) {
    if (combined.includes(keyword)) {
      return "Dit product lijkt een verboden categorie te bevatten. Controleer onze lijst met verboden producten.";
    }
  }
  return null;
}
