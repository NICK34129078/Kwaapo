import assert from "node:assert/strict";
import {
  formatSellerShipUpdateError,
} from "./src/utils/orderShipError.ts";

assert.equal(
  formatSellerShipUpdateError(new Error("Bestelling niet gevonden.")),
  "Bestelling niet gevonden."
);

assert.equal(
  formatSellerShipUpdateError({
    code: "PGRST116",
    message: "JSON object requested, multiple (or no) rows returned",
    details: "",
    hint: "",
    name: "PostgrestError",
  }),
  "Bestelling niet gevonden of geen rechten om te wijzigen."
);

assert.equal(
  formatSellerShipUpdateError({
    code: "42703",
    message: "column oi.product_name does not exist",
    details: "",
    hint: "",
    name: "PostgrestError",
  }),
  "Verzending kon niet worden opgeslagen door een serverconfiguratiefout."
);

assert.equal(
  formatSellerShipUpdateError(new Error("unexpected")),
  "Verzending bijwerken mislukt. Probeer het opnieuw."
);

console.log("order-ship-error.test.mjs: ok");
