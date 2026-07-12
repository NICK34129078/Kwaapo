/** 8-digit Dutch KVK number or null if invalid. Keeps leading zeros; strips non-digits. */
export function normalizeKvkNumberInput(
  raw: string | null | undefined
): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 8) {
    return null;
  }
  return digits;
}
