import { getRandomBytes } from "expo-crypto";

/** RFC 4122 UUID v4 uit 16 willekeurige bytes (versie + variant-bits gezet). */
function formatUuidV4FromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes.subarray(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += b[i]!.toString(16).padStart(2, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Laatste redmiddel (geen crypto API); niet voor productie-security-kritiek. */
function fallbackUuidV4Math(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    b[i] = Math.floor(Math.random() * 256);
  }
  return formatUuidV4FromBytes(b);
}

/**
 * UUID v4 voor client-side IDs (bv. X-Post-Id).
 * Gebruikt `globalThis.crypto.randomUUID` als beschikbaar (web/modern),
 * anders `expo-crypto` `getRandomBytes` (Expo/React Native — vervanger voor oude expo-random).
 */
export function createUuidV4(): string {
  const wc = globalThis.crypto as Crypto | undefined;
  if (wc && typeof wc.randomUUID === "function") {
    try {
      return wc.randomUUID();
    } catch {
      /* fall through */
    }
  }

  try {
    const raw = getRandomBytes(16);
    return formatUuidV4FromBytes(raw);
  } catch {
    return fallbackUuidV4Math();
  }
}
