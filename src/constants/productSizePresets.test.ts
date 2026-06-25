import {
  getSizeMode,
  sizeModeRequiresVariants,
} from "../constants/productSizePresets";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function runProductSizePresetsTests(): void {
  assert(
    getSizeMode("clothing", "t_shirts") === "clothing_sizes",
    "heren T-shirt: kledingmaten"
  );
  assert(
    getSizeMode("shoes", "sneakers") === "shoe_sizes",
    "dames sneakers: schoenmaten"
  );
  assert(
    getSizeMode("beauty", "fragrance") === "no_sizes",
    "parfum: geen maten"
  );
  assert(
    getSizeMode("sports", "football") === "no_sizes",
    "voetbal: geen maten"
  );
  assert(
    getSizeMode("sports", "sportswear") === "clothing_sizes",
    "sportkleding: kledingmaten"
  );
  assert(
    getSizeMode("clothing", null) === "no_sizes",
    "zonder producttype: geen maten"
  );
  assert(
    getSizeMode(null, "t_shirts") === "no_sizes",
    "zonder categorie: geen maten"
  );
  assert(
    getSizeMode("accessories", "belts") === "optional_sizes",
    "riem: optionele maten"
  );
  assert(
    getSizeMode("accessories", "bags") === "no_sizes",
    "tas: geen maten"
  );
  assert(
    sizeModeRequiresVariants("clothing_sizes"),
    "clothing_sizes vereist varianten"
  );
  assert(
    !sizeModeRequiresVariants("no_sizes"),
    "no_sizes vereist geen varianten"
  );
}

if (require.main === module) {
  runProductSizePresetsTests();
  console.log("productSizePresets tests passed");
}
