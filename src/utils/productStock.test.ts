import {
  formatOrderItemSizeLabel,
  formatOrderItemSizeLine,
} from "./orderDashboard";
import { isProductPurchasable, productUsesVariantCheckout } from "./productStock";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runProductStockTests(): void {
  const simpleInStock = {
    stock: 5,
    usesVariants: false,
    variantsReady: false,
  };
  const variantProduct = {
    stock: 0,
    usesVariants: true,
    variantsReady: true,
  };

  assert(productUsesVariantCheckout(variantProduct), "variant product herkend");
  assert(!productUsesVariantCheckout(simpleInStock), "simpel product geen variant checkout");

  assert(isProductPurchasable(simpleInStock), "simpel product met voorraad koopbaar");
  assert(!isProductPurchasable({ ...simpleInStock, stock: 0 }), "uitverkocht niet koopbaar");

  assert(
    isProductPurchasable(variantProduct, { variantStock: 2, quantity: 1 }),
    "variant met voorraad koopbaar ook als product.stock 0 is"
  );
  assert(
    !isProductPurchasable(variantProduct, { variantStock: 0, quantity: 1 }),
    "variant zonder voorraad niet koopbaar"
  );
  assert(
    !isProductPurchasable(variantProduct, { variantStock: 1, quantity: 2 }),
    "variant onvoldoende voor quantity"
  );

  assert(
    formatOrderItemSizeLabel({ selectedVariantValue: "M", size: null }) === "M",
    "variant maat label"
  );
  assert(
    formatOrderItemSizeLabel({ selectedVariantValue: null, size: "L" }) === "L",
    "legacy size label"
  );
  assert(formatOrderItemSizeLine({ selectedVariantValue: "42", size: null }) === "Maat 42", "maat regel");
}

if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") {
  runProductStockTests();
}
