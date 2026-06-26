import { supabase } from "../lib/supabase";
import type { ModerationTargetType } from "../constants/moderationReasons";
import { formatUserFacingError } from "../utils/formatAppError";

type RpcResult = {
  success?: boolean;
  duplicate?: boolean;
  reason?: string;
};

export async function submitModerationReport(
  targetType: ModerationTargetType,
  targetId: string,
  reason: string,
  details?: string
): Promise<{ duplicate: boolean }> {
  const { data, error } = await supabase.rpc("submit_moderation_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details?.trim() || null,
  });

  if (error) {
    throw new Error(formatUserFacingError(error, "Melden mislukt. Probeer het opnieuw."));
  }

  const result = (data ?? {}) as RpcResult;
  if (result.success === false) {
    if (result.reason === "cannot_report_self") {
      throw new Error("Je kunt jezelf niet melden.");
    }
    throw new Error(formatUserFacingError(result.reason, "Melden mislukt. Probeer het opnieuw."));
  }

  return { duplicate: result.duplicate === true };
}

export async function reportProduct(
  productId: string,
  reason: string
): Promise<{ duplicate: boolean }> {
  return submitModerationReport("product", productId, reason);
}

export async function reportProfile(
  profileId: string,
  reason: string
): Promise<{ duplicate: boolean }> {
  return submitModerationReport("profile", profileId, reason);
}

export async function reportSeller(
  sellerId: string,
  reason: string
): Promise<{ duplicate: boolean }> {
  return submitModerationReport("seller", sellerId, reason);
}
