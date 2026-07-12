import { CLOUD_VIDEO_WORKER_BASE } from "../constants/cloudVideo";
import { buildWorkerAuthHeaders } from "./workerRequest";
import type { BusinessInfoPayload } from "../types/sellerOnboarding";
import { normalizeKvkNumberInput } from "../utils/kvkNumber";

export { normalizeKvkNumberInput } from "../utils/kvkNumber";

type WorkerJson = Record<string, unknown> & {
  error?: string;
  message?: string;
  detail?: string;
  valid?: boolean;
};

function formatWorkerError(json: WorkerJson, status: number): string {
  if (status === 401 || status === 403) {
    return "Je sessie is verlopen. Log opnieuw in.";
  }
  const serverMessage = typeof json.error === "string" ? json.error.trim() : "";
  if (
    serverMessage.length > 0 &&
    serverMessage.length <= 220 &&
    !/KVK_API_KEY|stack|TypeError/i.test(serverMessage)
  ) {
    return serverMessage;
  }
  return "KVK-controle mislukt. Probeer het opnieuw.";
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

export async function verifyKvkBusinessDetails(
  payload: BusinessInfoPayload & { kvkNumber: string }
): Promise<{ kvkNumber: string; registeredName?: string }> {
  const kvkNumber = normalizeKvkNumberInput(payload.kvkNumber);
  if (!kvkNumber) {
    throw new Error("Vul een geldig KVK-nummer in (8 cijfers).");
  }

  const url = `${CLOUD_VIDEO_WORKER_BASE}?kvkVerify=1`;
  const headers = await buildWorkerAuthHeaders({
    "Content-Type": "application/json",
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
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
