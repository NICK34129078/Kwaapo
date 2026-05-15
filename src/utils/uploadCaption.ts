const DEFAULT_CAPTION = "Nieuwe look";
const MAX_CAPTION_LENGTH = 150;

export function sanitizeUploadCaption(raw?: string | null): string {
  const trimmed = (raw ?? "").trim();
  const clipped = trimmed.slice(0, MAX_CAPTION_LENGTH);
  return clipped.length > 0 ? clipped : DEFAULT_CAPTION;
}
