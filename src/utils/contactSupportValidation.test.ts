import {
  CONTACT_MESSAGE_MAX_WORDS,
  countContactWords,
  countPhoneDigits,
  isValidContactEmail,
  trimMessageToWordLimit,
  validateContactSupportFields,
} from "./contactSupportValidation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const messages = {
  emailInvalid: "Vul een geldig e-mailadres in.",
  phoneRequired: "Vul een telefoonnummer in.",
  messageTooLong: "Je bericht mag maximaal 200 woorden bevatten.",
  messageTooShort: "Beschrijf je vraag iets uitgebreider.",
};

assert(isValidContactEmail("test@kwaapo.nl"), "valid email");
assert(!isValidContactEmail("invalid"), "invalid email");

assert(countPhoneDigits("+31 6 12345678") >= 6, "phone digits");
assert(countContactWords("een twee drie vier vijf") === 5, "word count");

const trimmed = trimMessageToWordLimit(
  Array.from({ length: CONTACT_MESSAGE_MAX_WORDS + 5 }, (_, i) => `w${i}`).join(
    " "
  )
);
assert(countContactWords(trimmed) === CONTACT_MESSAGE_MAX_WORDS, "trim words");

const valid = validateContactSupportFields(
  {
    email: "user@example.com",
    phone: "+31 612345678",
    message: "Dit is een testbericht met voldoende woorden.",
  },
  messages
);
assert(Object.keys(valid).length === 0, "valid form has no errors");

const invalid = validateContactSupportFields(
  {
    email: "bad",
    phone: "12",
    message: "kort",
  },
  messages
);
assert(invalid.email === messages.emailInvalid, "email error");
assert(invalid.phone === messages.phoneRequired, "phone error");
assert(invalid.message === messages.messageTooShort, "message error");

console.log("contactSupportValidation.test.ts: all assertions passed");
