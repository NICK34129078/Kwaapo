import test from "node:test";
import assert from "node:assert/strict";

import { normalizeKvkNumberInput } from "../utils/kvkNumber";
import { mapSellerRpcError, mapSellerSaveError } from "./sellerOnboardingErrors";

test("valid 8-digit KVK passes", () => {
  assert.equal(normalizeKvkNumberInput("12345678"), "12345678");
});

test("KVK with spaces normalizes", () => {
  assert.equal(normalizeKvkNumberInput("12 34 56 78"), "12345678");
});

test("KVK with dashes normalizes", () => {
  assert.equal(normalizeKvkNumberInput("12-34-56-78"), "12345678");
});

test("KVK with leading zeros preserved", () => {
  assert.equal(normalizeKvkNumberInput("01234567"), "01234567");
});

test("too short KVK rejected", () => {
  assert.equal(normalizeKvkNumberInput("1234567"), null);
});

test("too long KVK rejected", () => {
  assert.equal(normalizeKvkNumberInput("123456789"), null);
});

test("non-numeric KVK rejected", () => {
  assert.equal(normalizeKvkNumberInput("1234ABCD"), null);
});

test("empty KVK rejected", () => {
  assert.equal(normalizeKvkNumberInput(""), null);
  assert.equal(normalizeKvkNumberInput("   "), null);
});

test("integer-like input stays 8 digits as string", () => {
  const normalized = normalizeKvkNumberInput("00000001");
  assert.equal(normalized, "00000001");
  assert.equal(typeof normalized, "string");
});

test("mapSellerRpcError returns Dutch messages", () => {
  assert.match(mapSellerRpcError("not_authenticated"), /ingelogd/i);
  assert.match(mapSellerRpcError("profile_not_found"), /profiel/i);
});

test("mapSellerSaveError maps read-only trigger message", () => {
  const err = mapSellerSaveError({ message: "kvk_number is read-only", code: "P0001" });
  assert.match(err.message, /serverupdate|Vernieuw/i);
});

test("mapSellerSaveError maps 42501", () => {
  const err = mapSellerSaveError({ message: "permission denied for table profiles", code: "42501" });
  assert.match(err.message, /rechten/i);
});

test("mapSellerSaveError maps missing RPC", () => {
  const err = mapSellerSaveError({
    message: "Could not find the function public.update_my_seller_business_info",
    code: "PGRST202",
  });
  assert.match(err.message, /server nog niet bijgewerkt/i);
});
