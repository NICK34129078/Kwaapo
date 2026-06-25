export type ProductStockTone = "ok" | "low" | "out";

export type VariantCheckoutProduct = {
  stock: number;
  usesVariants: boolean;
  variantsReady: boolean;
};

export function productUsesVariantCheckout(product: VariantCheckoutProduct): boolean {
  return product.usesVariants === true && product.variantsReady === true;
}

export function isProductPurchasable(
  product: VariantCheckoutProduct,
  options?: { variantStock?: number | null; quantity?: number }
): boolean {
  const quantity = Math.max(1, Math.floor(options?.quantity ?? 1));
  if (productUsesVariantCheckout(product)) {
    const variantStock = options?.variantStock;
    return variantStock != null && variantStock >= quantity;
  }
  return product.stock > 0;
}

export type ProductStockStatus = {
  stock: number;
  label: string;
  sublabel: string | null;
  tone: ProductStockTone;
};

export function getProductStockStatus(stock: number): ProductStockStatus {
  const safe = Math.max(0, Math.floor(stock));

  if (safe === 0) {
    return {
      stock: safe,
      label: "Uitverkocht",
      sublabel: null,
      tone: "out",
    };
  }

  if (safe <= 3) {
    return {
      stock: safe,
      label: `Bijna uitverkocht: ${safe}`,
      sublabel: `Nog ${safe} beschikbaar`,
      tone: "low",
    };
  }

  return {
    stock: safe,
    label: `${safe} op voorraad`,
    sublabel: `${safe} stuks beschikbaar`,
    tone: "ok",
  };
}

export function formatStockHistoryLine(adjustment: {
  changeAmount: number;
  stockAfter: number;
  reason: string;
  createdAt: string;
}): string {
  const { changeAmount, stockAfter, reason, createdAt } = adjustment;
  const date = new Date(createdAt);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  let prefix: string;
  if (isToday) {
    prefix = "Vandaag";
  } else if (isYesterday) {
    prefix = "Gisteren";
  } else {
    prefix = date.toLocaleDateString("nl-NL", {
      day: "numeric",
      month: "long",
    });
  }

  if (reason.startsWith("Maat ") && reason.includes(": voorraad toegevoegd") && changeAmount > 0) {
    return `${prefix} +${changeAmount} toegevoegd aan ${reason.split(":")[0]?.replace("Maat ", "maat ") ?? "maat"}`;
  }
  if (reason.startsWith("Maat ") && reason.includes(": voorraad aangepast")) {
    return `${prefix} ${reason.split(":")[0]?.replace("Maat ", "maat ") ?? "Maat"} aangepast naar ${stockAfter}`;
  }
  if (reason.startsWith("Maat ") && reason.includes(": verkocht")) {
    return `${prefix} 1 ${reason.split(":")[0]?.replace("Maat ", "maat ") ?? "maat"} verkocht`;
  }
  if (reason.startsWith("Maat ") && reason.includes(": checkout")) {
    return `${prefix} ${Math.abs(changeAmount)} ${reason.split(":")[0]?.replace("Maat ", "maat ") ?? "maat"} gereserveerd`;
  }
  if (reason.startsWith("Maat ") && reason.includes("verlopen")) {
    return `${prefix} ${changeAmount} terug (${reason.split(":")[0]?.replace("Maat ", "maat ") ?? "maat"}) na verlopen checkout`;
  }

  if (reason === "Voorraad toegevoegd" && changeAmount > 0) {
    return `${prefix} +${changeAmount} voorraad toegevoegd`;
  }
  if (reason === "Voorraad gecorrigeerd") {
    return `${prefix} voorraad aangepast naar ${stockAfter}`;
  }
  if (reason === "Verkocht") {
    return `${prefix} ${Math.abs(changeAmount)} verkocht`;
  }
  if (reason === "Checkout verlopen" && changeAmount > 0) {
    return `${prefix} ${changeAmount} terug na verlopen checkout`;
  }
  if (reason === "Checkout gereserveerd") {
    return `${prefix} ${Math.abs(changeAmount)} gereserveerd voor checkout`;
  }

  return `${prefix} ${reason}`;
}
