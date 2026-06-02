export type UploadProductInput = {
  productId?: string | null;
  productTitle?: string;
  productUrl?: string;
  productBrand?: string;
  productPriceText?: string;
};

export type SanitizedUploadProduct = {
  productId: string;
  productTitle: string;
  productUrl: string;
  productBrand: string;
  productPriceText: string;
  isShopPost: boolean;
};

function trimMax(value: string | undefined, max: number): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

/** Leeg = ok; anders moet http:// of https://. */
export function isValidProductUrl(url: string): boolean {
  const t = url.trim();
  if (t.length === 0) {
    return true;
  }
  return /^https?:\/\//i.test(t);
}

export function sanitizeUploadProduct(
  input?: UploadProductInput
): SanitizedUploadProduct {
  const productId = trimMax(input?.productId ?? "", 36);
  if (productId.length > 0) {
    return {
      productId,
      productTitle: "",
      productUrl: "",
      productBrand: "",
      productPriceText: "",
      isShopPost: true,
    };
  }

  const productTitle = trimMax(input?.productTitle, 80);
  const productUrl = trimMax(input?.productUrl, 500);
  const productBrand = trimMax(input?.productBrand, 60);
  const productPriceText = trimMax(input?.productPriceText, 40);

  if (productUrl.length === 0) {
    return {
      productId: "",
      productTitle: "",
      productUrl: "",
      productBrand: "",
      productPriceText: "",
      isShopPost: false,
    };
  }

  return {
    productId: "",
    productTitle,
    productUrl,
    productBrand,
    productPriceText,
    isShopPost: true,
  };
}

export function productFieldsForWorkerPayload(
  sanitized: SanitizedUploadProduct
): Record<string, string> | undefined {
  if (sanitized.productId.length > 0) {
    return { productId: sanitized.productId };
  }
  if (!sanitized.isShopPost) {
    return undefined;
  }
  const out: Record<string, string> = {
    productUrl: sanitized.productUrl,
  };
  if (sanitized.productTitle.length > 0) {
    out.productTitle = sanitized.productTitle;
  }
  if (sanitized.productBrand.length > 0) {
    out.productBrand = sanitized.productBrand;
  }
  if (sanitized.productPriceText.length > 0) {
    out.productPriceText = sanitized.productPriceText;
  }
  return out;
}
