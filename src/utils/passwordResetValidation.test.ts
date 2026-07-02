import test from "node:test";
import assert from "node:assert/strict";
import {
  validateNewPassword,
  validatePasswordConfirmation,
  validatePasswordResetForm,
} from "./passwordResetValidation.ts";

test("validateNewPassword rejects empty and short passwords", () => {
  assert.equal(validateNewPassword(""), "Vul een nieuw wachtwoord in.");
  assert.equal(validateNewPassword("abc"), "Wachtwoord moet minimaal 6 tekens zijn.");
  assert.equal(validateNewPassword("abcdef"), null);
});

test("validatePasswordConfirmation requires matching passwords", () => {
  assert.equal(
    validatePasswordConfirmation("abcdef", ""),
    "Herhaal je nieuwe wachtwoord."
  );
  assert.equal(
    validatePasswordConfirmation("abcdef", "abcdeg"),
    "Wachtwoorden komen niet overeen."
  );
  assert.equal(validatePasswordConfirmation("abcdef", "abcdef"), null);
});

test("validatePasswordResetForm aggregates field errors", () => {
  assert.deepEqual(validatePasswordResetForm("", ""), {
    password: "Vul een nieuw wachtwoord in.",
    confirmPassword: "Herhaal je nieuwe wachtwoord.",
  });
  assert.deepEqual(validatePasswordResetForm("abcdef", "abcdef"), {});
});
