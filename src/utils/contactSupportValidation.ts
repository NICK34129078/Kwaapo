export const CONTACT_MESSAGE_MAX_WORDS = 200;
const MIN_MESSAGE_CHARS = 20;
const MIN_MESSAGE_WORDS = 5;
const MIN_PHONE_DIGITS = 6;

export type ContactField = "email" | "phone" | "message";

export type ContactFieldErrors = Partial<Record<ContactField, string>>;

export function countContactWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

export function countPhoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

export function isValidContactEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function trimMessageToWordLimit(
  text: string,
  maxWords = CONTACT_MESSAGE_MAX_WORDS
): string {
  const parts = text.trim().length === 0 ? [] : text.trim().split(/\s+/);
  if (parts.length <= maxWords) {
    return text;
  }
  return parts.slice(0, maxWords).join(" ");
}

export function validateContactSupportFields(
  fields: { email: string; phone: string; message: string },
  messages: {
    emailInvalid: string;
    phoneRequired: string;
    messageTooLong: string;
    messageTooShort: string;
  }
): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  const email = fields.email.trim();
  const phone = fields.phone.trim();
  const message = fields.message.trim();
  const wordCount = countContactWords(message);

  if (!email || !isValidContactEmail(email)) {
    errors.email = messages.emailInvalid;
  }
  if (!phone || countPhoneDigits(phone) < MIN_PHONE_DIGITS) {
    errors.phone = messages.phoneRequired;
  }
  if (wordCount > CONTACT_MESSAGE_MAX_WORDS) {
    errors.message = messages.messageTooLong;
  } else if (
    message.length < MIN_MESSAGE_CHARS &&
    wordCount < MIN_MESSAGE_WORDS
  ) {
    errors.message = messages.messageTooShort;
  }

  return errors;
}

export function hasContactFieldErrors(errors: ContactFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
