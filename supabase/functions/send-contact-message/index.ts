import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_WORDS = 200;
const MIN_MESSAGE_CHARS = 20;
const MIN_MESSAGE_WORDS = 5;
const MIN_PHONE_DIGITS = 6;

type ContactPayload = {
  email?: string;
  phone?: string;
  message?: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0).length;
}

function countPhoneDigits(phone: string): number {
  return phone.replace(/\D/g, "").length;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateContactPayload(payload: ContactPayload): {
  ok: true;
  email: string;
  phone: string;
  message: string;
  wordCount: number;
} | { ok: false; message: string } {
  const email = (payload.email ?? "").trim();
  const phone = (payload.phone ?? "").trim();
  const message = (payload.message ?? "").trim();

  if (!email) {
    return { ok: false, message: "Vul een geldig e-mailadres in." };
  }
  if (!isValidEmail(email)) {
    return { ok: false, message: "Vul een geldig e-mailadres in." };
  }
  if (!phone) {
    return { ok: false, message: "Vul een telefoonnummer in." };
  }
  if (countPhoneDigits(phone) < MIN_PHONE_DIGITS) {
    return { ok: false, message: "Vul een telefoonnummer in." };
  }
  if (!message) {
    return { ok: false, message: "Beschrijf je vraag iets uitgebreider." };
  }

  const wordCount = countWords(message);
  if (wordCount > MAX_WORDS) {
    return {
      ok: false,
      message: "Je bericht mag maximaal 200 woorden bevatten.",
    };
  }
  if (message.length < MIN_MESSAGE_CHARS && wordCount < MIN_MESSAGE_WORDS) {
    return { ok: false, message: "Beschrijf je vraag iets uitgebreider." };
  }

  return { ok: true, email, phone, message, wordCount };
}

async function sendSupportEmail(params: {
  to: string;
  from: string;
  userId: string | null;
  email: string;
  phone: string;
  message: string;
  createdAt: string;
}): Promise<void> {
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const subject = "Nieuw contactbericht via Kwaapo";
  const text = [
    "Nieuwe contactaanvraag ontvangen.",
    "",
    "Gebruiker:",
    `- User ID: ${params.userId ?? "—"}`,
    `- E-mail: ${params.email}`,
    `- Telefoon: ${params.phone}`,
    "",
    "Bericht:",
    params.message,
    "",
    `Verzonden op: ${params.createdAt}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend API error (${response.status}): ${detail}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, message: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supportEmail = Deno.env.get("CONTACT_SUPPORT_EMAIL")?.trim();
  const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      { success: false, message: "Server configuration error" },
      500
    );
  }

  if (!supportEmail) {
    return jsonResponse(
      { success: false, message: "CONTACT_SUPPORT_EMAIL is not configured" },
      500
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, message: "Unauthorized" }, 401);
  }

  let payload: ContactPayload;
  try {
    payload = (await req.json()) as ContactPayload;
  } catch {
    return jsonResponse({ success: false, message: "Invalid JSON body" }, 400);
  }

  const validated = validateContactPayload(payload);
  if (!validated.ok) {
    return jsonResponse({ success: false, message: validated.message }, 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ success: false, message: "Unauthorized" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const createdAt = new Date().toISOString();

  const { data: inserted, error: insertError } = await admin
    .from("contact_messages")
    .insert({
      user_id: user.id,
      email: validated.email,
      phone: validated.phone,
      message: validated.message,
      word_count: validated.wordCount,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    console.error("contact_messages insert failed:", insertError);
    return jsonResponse(
      {
        success: false,
        message: "Er ging iets mis. Probeer het opnieuw.",
      },
      500
    );
  }

  const fromAddress =
    resendFrom ?? "Kwaapo Support <onboarding@resend.dev>";

  try {
    await sendSupportEmail({
      to: supportEmail,
      from: fromAddress,
      userId: user.id,
      email: validated.email,
      phone: validated.phone,
      message: validated.message,
      createdAt,
    });

    await admin
      .from("contact_messages")
      .update({
        status: "sent",
        sent_to_email_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", inserted.id);
  } catch (mailError) {
    const errorMessage =
      mailError instanceof Error ? mailError.message : String(mailError);
    console.error("send-contact-message mail failed:", errorMessage);

    await admin
      .from("contact_messages")
      .update({
        status: "error",
        error_message: errorMessage.slice(0, 500),
      })
      .eq("id", inserted.id);

    return jsonResponse(
      {
        success: false,
        message: "Er ging iets mis. Probeer het opnieuw.",
      },
      500
    );
  }

  return jsonResponse({ success: true });
});
