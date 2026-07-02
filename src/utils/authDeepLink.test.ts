import test from "node:test";
import assert from "node:assert/strict";
import {
  isPasswordRecoveryDeepLink,
  parseSupabaseAuthParamsFromUrl,
} from "./authDeepLink";

test("parseSupabaseAuthParamsFromUrl reads hash tokens", () => {
  const url =
    "lumen-fashion://auth/reset-password#access_token=abc&refresh_token=def&type=recovery";
  const parsed = parseSupabaseAuthParamsFromUrl(url);
  assert.equal(parsed.accessToken, "abc");
  assert.equal(parsed.refreshToken, "def");
  assert.equal(parsed.type, "recovery");
  assert.equal(isPasswordRecoveryDeepLink(url), true);
});

test("parseSupabaseAuthParamsFromUrl returns nulls for unrelated links", () => {
  const parsed = parseSupabaseAuthParamsFromUrl("lumen-fashion://checkout/success");
  assert.equal(parsed.accessToken, null);
  assert.equal(parsed.refreshToken, null);
  assert.equal(isPasswordRecoveryDeepLink("lumen-fashion://checkout/success"), false);
});
