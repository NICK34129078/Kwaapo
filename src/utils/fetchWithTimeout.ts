/**
 * fetch met harde timeout zodat upload-flows niet oneindig op loading blijven hangen.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 300_000,
  timeoutMessage = "Upload duurde te lang. Probeer het opnieuw."
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
