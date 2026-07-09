import { supabase } from "../lib/supabase";
import { formatUserFacingError } from "../utils/formatAppError";

type SendContactSupportMessageParams = {
  email: string;
  phone: string;
  message: string;
};

type EdgeResponse = {
  success?: boolean;
  message?: string;
};

export async function sendContactSupportMessage(
  params: SendContactSupportMessageParams
): Promise<void> {
  const { data, error } = await supabase.functions.invoke<EdgeResponse>(
    "send-contact-message",
    {
      body: {
        email: params.email.trim(),
        phone: params.phone.trim(),
        message: params.message.trim(),
      },
    }
  );

  if (error) {
    throw new Error(
      formatUserFacingError(
        error,
        "Er ging iets mis. Probeer het opnieuw."
      )
    );
  }

  if (data?.success === false) {
    throw new Error(
      formatUserFacingError(
        data.message,
        "Er ging iets mis. Probeer het opnieuw."
      )
    );
  }

  if (data?.success !== true) {
    throw new Error("Er ging iets mis. Probeer het opnieuw.");
  }
}
