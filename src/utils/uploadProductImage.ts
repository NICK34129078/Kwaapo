import { supabase } from "../lib/supabase";
import { createUuidV4 } from "./uuid";

const BUCKET = "product-images";
const MAX_IMAGES = 8;

export { MAX_IMAGES as MAX_PRODUCT_IMAGES };

export async function uploadProductImages(
  ownerId: string,
  productId: string,
  localUris: string[]
): Promise<string[]> {
  const urls: string[] = [];

  for (let i = 0; i < localUris.length; i++) {
    const uri = localUris[i];
    if (!uri || uri.startsWith("http")) {
      if (uri?.startsWith("http")) {
        urls.push(uri);
      }
      continue;
    }

    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error("Kon een productfoto niet lezen.");
    }
    const fileBuffer = await response.arrayBuffer();
    const extGuess = uri.split(".").pop()?.split("?")[0]?.toLowerCase();
    const ext =
      extGuess && extGuess.length <= 5 && /^[a-z0-9]+$/.test(extGuess)
        ? extGuess
        : "jpg";
    const path = `${ownerId}/${productId}/${createUuidV4()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileBuffer, {
        upsert: false,
        contentType: ext === "png" ? "image/png" : "image/jpeg",
      });

    if (uploadError) {
      throw uploadError;
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data
      .publicUrl;
    urls.push(publicUrl);
  }

  return urls;
}
