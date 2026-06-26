/** Centrale redenen voor product-/profielmeldingen (moderation_reports). */

export const PRODUCT_REPORT_REASONS = [
  { id: "counterfeit", label: "Namaak / replica" },
  { id: "illegal_item", label: "Illegaal product" },
  { id: "stolen_goods", label: "Gestolen goederen" },
  { id: "misleading_description", label: "Misleidende beschrijving" },
  { id: "wrong_category", label: "Verkeerde categorie" },
  { id: "unsafe_product", label: "Onveilig product" },
  { id: "prohibited_item", label: "Verboden item" },
  { id: "intellectual_property", label: "Auteursrecht / merk" },
  { id: "scam", label: "Oplichting / scam" },
  { id: "other", label: "Iets anders" },
] as const;

export type ProductReportReason = (typeof PRODUCT_REPORT_REASONS)[number]["id"];

export const PROFILE_REPORT_REASONS = [
  { id: "spam_or_scam", label: "Spam of oplichting" },
  { id: "harassment_or_bullying", label: "Intimidatie of pesten" },
  { id: "hate_or_discrimination", label: "Haat of discriminatie" },
  { id: "nudity_or_sexual_content", label: "Naaktheid of seksuele content" },
  { id: "violence_or_threats", label: "Geweld of bedreigingen" },
  { id: "impersonation", label: "Impersonatie" },
  { id: "other", label: "Iets anders" },
] as const;

export type ProfileReportReason = (typeof PROFILE_REPORT_REASONS)[number]["id"];

export type ModerationTargetType = "product" | "profile" | "seller";

export type ModerationReasonOption = { id: string; label: string };

export function reasonsForTargetType(
  targetType: ModerationTargetType
): readonly ModerationReasonOption[] {
  if (targetType === "product") {
    return PRODUCT_REPORT_REASONS;
  }
  return PROFILE_REPORT_REASONS;
}
