import { supabase } from "../lib/supabase";
import { isPersistablePostId } from "./postLikesService";

/**
 * Registreert een product-CTA-klik. Faalt stil (log only) zodat de externe link
 * altijd geopend kan worden.
 */
export async function recordProductClick(
  postId: string,
  source: string = "feed"
): Promise<void> {
  if (!isPersistablePostId(postId)) {
    return;
  }

  const trimmedSource = source.trim().slice(0, 40) || "feed";

  try {
    const { error } = await supabase.rpc("record_product_click", {
      p_post_id: postId,
      p_source: trimmedSource,
    });

    if (error) {
      console.warn("[ProductClicks] record failed:", error.message);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[ProductClicks] record failed:", msg);
  }
}
