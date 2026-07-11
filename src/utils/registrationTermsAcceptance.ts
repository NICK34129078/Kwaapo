export const REGISTRATION_TERMS_LABEL =
  "Door een account aan te maken ga ik akkoord met de Gebruikersvoorwaarden en bevestig ik dat ik het Privacybeleid heb gelezen.";

export const REGISTRATION_AGE_LABEL =
  "Ik bevestig dat ik minimaal 16 jaar oud ben.";

export type RegistrationConsentInput = {
  acceptedTerms: boolean;
  confirmedMinimumAge: boolean;
};

export type RegistrationConsentResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateRegistrationConsent(
  input: RegistrationConsentInput
): RegistrationConsentResult {
  if (!input.acceptedTerms) {
    return {
      ok: false,
      message:
        "Je moet akkoord gaan met de Gebruikersvoorwaarden en het Privacybeleid lezen voordat je een account aanmaakt.",
    };
  }
  if (!input.confirmedMinimumAge) {
    return {
      ok: false,
      message: "Je moet bevestigen dat je minimaal 16 jaar oud bent.",
    };
  }
  return { ok: true };
}
