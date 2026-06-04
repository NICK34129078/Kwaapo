import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { supabase } from "../lib/supabase";
import type { BusinessInfoPayload } from "../types/sellerOnboarding";

type WorkerJson = Record<string, unknown> & {
  error?: string;
  message?: string;
  detail?: string;
  valid?: boolean;
};

function formatWorkerError(json: WorkerJson, status: number): string {
  const parts = [json.error, json.message, json.detail].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  if (parts.length > 0) {
    return parts.join(" — ");
  }
  return `KVK-controle mislukt (${status}).`;
}

async function parseWorkerResponse(res: Response): Promise<WorkerJson> {
  const text = await res.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as WorkerJson;
  } catch {
    throw new Error(
      `Worker antwoord is geen JSON (${res.status}): ${text.slice(0, 280)}`
    );
  }
}

async function getAuthUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }
  return user.id;
}

/** 8-digit Dutch KVK number or null if invalid. */
export function normalizeKvkNumberInput(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }
  return digits;
}

export async function verifyKvkBusinessDetails(
  payload: BusinessInfoPayload & { kvkNumber: string }
): Promise<{ kvkNumber: string; registeredName?: string }> {
  const kvkNumber = normalizeKvkNumberInput(payload.kvkNumber);
  if (!kvkNumber) {
    throw new Error("Vul een geldig KVK-nummer in (8 cijfers).");
  }

  const userId = await getAuthUserId();
  const url = `${CLOUD_VIDEO_WORKER_BASE}?kvkVerify=1`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-User-Id": userId,
    },
    body: JSON.stringify({
      kvkNumber,
      businessName: payload.businessName,
      businessStreet: payload.businessStreet,
      businessHouseNumber: payload.businessHouseNumber,
      businessPostalCode: payload.businessPostalCode,
      businessCity: payload.businessCity,
      businessCountry: payload.businessCountry,
    }),
  });

  const json = await parseWorkerResponse(res);
  if (!res.ok || typeof json.error === "string") {
    throw new Error(formatWorkerError(json, res.status));
  }
  if (json.valid !== true) {
    throw new Error(formatWorkerError(json, res.status));
  }

  const registeredName =
    typeof json.registeredName === "string" ? json.registeredName : undefined;
  const verifiedKvk =
    typeof json.kvkNumber === "string" ? json.kvkNumber : kvkNumber;

  return { kvkNumber: verifiedKvk, registeredName };
}
