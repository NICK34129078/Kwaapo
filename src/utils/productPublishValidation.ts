import {
  categoryRequiresAudience,
  getSizeMode,
  sizeModeRequiresVariants,
} from "../constants/productSizePresets";
import type { ShopAudienceCode, ShopMainCategoryCode } from "../constants/shopCategories";
import {
  checkProhibitedProductListing,
  moderateUserText,
  sanitizePlainText,
} from "./contentModerationFilter";

export type ProductPublishDraft = {
  name: string;
  description?: string;
  imageCount: number;
  priceValid: boolean;
  mainCategory: ShopMainCategoryCode | null;
  audience: ShopAudienceCode | null;
  subcategory: string | null;
  stockText: string;
  sizeVariantMode: "unset" | "yes" | "no";
  variantStockMap: Record<string, number>;
  payoutReady: boolean;
  sellerTermsAccepted: boolean;
};

function totalVariantStock(map: Record<string, number>): number {
  return Object.values(map).reduce((sum, n) => sum + Math.max(0, n), 0);
}

/** Menselijke checklist voor live zetten — geen technische fouten. */
export function getProductPublishBlockers(draft: ProductPublishDraft): string[] {
  const blockers: string[] = [];
  const trimmedName = sanitizePlainText(draft.name, 200);

  if (trimmedName.length < 2) {
    blockers.push("Vul een productnaam in.");
  }

  const nameMod = moderateUserText(trimmedName, "product_title");
  if (!nameMod.ok) {
    blockers.push(nameMod.message);
  }

  const description = sanitizePlainText(draft.description ?? "", 5000);
  const descMod = moderateUserText(description, "product_description");
  if (!descMod.ok) {
    blockers.push(descMod.message);
  }

  const prohibited = checkProhibitedProductListing(trimmedName, description);
  if (prohibited) {
    blockers.push(prohibited);
  }

  if (draft.imageCount < 1) {
    blockers.push("Voeg minimaal één productfoto toe.");
  }
  if (!draft.priceValid) {
    blockers.push("Vul een geldige prijs in.");
  }
  if (!draft.mainCategory) {
    blockers.push("Kies een categorie voordat je product live kan.");
  }
  if (
    draft.mainCategory &&
    categoryRequiresAudience(draft.mainCategory) &&
    !draft.audience
  ) {
    blockers.push("Kies voor wie dit product is (heren, dames, kinderen of unisex).");
  }
  if (!draft.subcategory) {
    blockers.push("Kies nog een producttype voordat je product live kan.");
  }
  if (!draft.payoutReady) {
    blockers.push("Rond je Stripe-uitbetalingen af voordat je product live kan.");
  }
  if (!draft.sellerTermsAccepted) {
    blockers.push("Accepteer de seller-voorwaarden voordat je een product live zet.");
  }

  const sizeMode =
    draft.mainCategory && draft.subcategory
      ? getSizeMode(draft.mainCategory, draft.subcategory)
      : "no_sizes";

  if (sizeModeRequiresVariants(sizeMode)) {
    const keys = Object.keys(draft.variantStockMap);
    if (keys.length === 0) {
      blockers.push("Kies minimaal één maat voor dit product.");
    } else if (totalVariantStock(draft.variantStockMap) <= 0) {
      blockers.push("Stel voorraad in voor minimaal één maat.");
    }
  } else if (sizeMode === "optional_sizes") {
    if (draft.sizeVariantMode === "unset") {
      blockers.push("Geef aan of dit product verschillende maten heeft.");
    } else if (draft.sizeVariantMode === "yes") {
      const keys = Object.keys(draft.variantStockMap);
      if (keys.length === 0) {
        blockers.push("Kies minimaal één maat voor dit product.");
      } else if (totalVariantStock(draft.variantStockMap) <= 0) {
        blockers.push("Stel voorraad in voor minimaal één maat.");
      }
    } else {
      const stock = parseInt(draft.stockText.replace(/\D/g, ""), 10);
      if (!Number.isFinite(stock) || stock <= 0) {
        blockers.push("Stel een voorraad groter dan 0 in.");
      }
    }
  } else {
    const stock = parseInt(draft.stockText.replace(/\D/g, ""), 10);
    if (!Number.isFinite(stock) || stock <= 0) {
      blockers.push("Stel een voorraad groter dan 0 in.");
    }
  }

  return blockers;
}
