import test from "node:test";
import assert from "node:assert/strict";
import {
  isPasswordRecoveryAuthEvent,
  isPasswordRecoverySession,
  shouldOpenPasswordRecoveryScreen,
} from "./authRecoveryState.ts";

test("isPasswordRecoveryAuthEvent detects PASSWORD_RECOVERY", () => {
  assert.equal(isPasswordRecoveryAuthEvent("PASSWORD_RECOVERY"), true);
  assert.equal(isPasswordRecoveryAuthEvent("SIGNED_IN"), false);
});

test("isPasswordRecoverySession requires recovery deep link flag", () => {
  const session = { access_token: "x" } as any;
  assert.equal(isPasswordRecoverySession(null, { recoveryDeepLink: true }), false);
  assert.equal(isPasswordRecoverySession(session, { recoveryDeepLink: true }), true);
  assert.equal(isPasswordRecoverySession(session), false);
});

test("shouldOpenPasswordRecoveryScreen", () => {
  const session = { access_token: "x" } as any;
  assert.equal(
    shouldOpenPasswordRecoveryScreen({ passwordRecoveryPending: true, session }),
    true
  );
  assert.equal(
    shouldOpenPasswordRecoveryScreen({ passwordRecoveryPending: true, session: null }),
    false
  );
  assert.equal(
    shouldOpenPasswordRecoveryScreen({ passwordRecoveryPending: false, session }),
    false
  );
});
