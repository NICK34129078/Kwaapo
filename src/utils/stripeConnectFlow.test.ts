import test from "node:test";
import assert from "node:assert/strict";

import { resolveStripeConnectAccountId } from "./stripeConnectAccount";
import { mapStripeConnectUserMessage } from "./stripeConnectErrors";

test("reuses existing Stripe Connect account id", () => {
  const result = resolveStripeConnectAccountId("acct_existing123", "acct_new999");
  assert.equal(result.accountId, "acct_existing123");
  assert.equal(result.reused, true);
  assert.equal(result.created, false);
});

test("creates account id when none exists", () => {
  const result = resolveStripeConnectAccountId(null, "acct_new999");
  assert.equal(result.accountId, "acct_new999");
  assert.equal(result.reused, false);
  assert.equal(result.created, true);
});

test("double tap reuses same account without second creation", () => {
  const first = resolveStripeConnectAccountId(null, "acct_abc");
  const second = resolveStripeConnectAccountId(first.accountId, "acct_should_not_use");
  assert.equal(second.accountId, "acct_abc");
  assert.equal(second.reused, true);
});

test("maps link read-only PostgREST error to friendly message", () => {
  const msg = mapStripeConnectUserMessage(
    {
      error: "PostgREST 400: stripe_connect_account_id is read-only",
      step: "stripe_connect_link",
    },
    500,
    "link"
  );
  assert.match(msg, /Stripe kon tijdelijk niet worden gestart/i);
  assert.doesNotMatch(msg, /PostgREST/i);
  assert.doesNotMatch(msg, /read-only/i);
});

test("maps status read-only PostgREST error to status message", () => {
  const msg = mapStripeConnectUserMessage(
    {
      error: "PostgREST 400: stripe_connect_onboarding_complete is read-only",
      step: "stripe_connect_status",
    },
    500,
    "status"
  );
  assert.match(msg, /Stripe-status kon niet worden opgeslagen/i);
});

test("maps expired session to login message", () => {
  const msg = mapStripeConnectUserMessage({ error: "Unauthorized" }, 401);
  assert.match(msg, /sessie is verlopen/i);
});

test("maps business account requirement clearly", () => {
  const msg = mapStripeConnectUserMessage(
    { error: "Alleen business accounts kunnen Stripe Connect gebruiken" },
    500
  );
  assert.match(msg, /bedrijfsgegevens/i);
});

test("account link success path does not expose raw worker JSON", () => {
  const msg = mapStripeConnectUserMessage(
    { error: "Stripe account link heeft geen url" },
    500
  );
  assert.match(msg, /onboarding-link/i);
  assert.doesNotMatch(msg, /PostgREST|P0001/i);
});

test("client cannot set stripe_connect_account_id via profiles update in app code", () => {
  // Static guard: onboarding service must use worker/RPC paths only.
  const fs = require("node:fs");
  const path = require("node:path");
  const sellerService = fs.readFileSync(
    path.join(process.cwd(), "src/services/sellerOnboardingService.ts"),
    "utf8"
  );
  const stripeService = fs.readFileSync(
    path.join(process.cwd(), "src/services/stripeConnectService.ts"),
    "utf8"
  );
  assert.doesNotMatch(sellerService, /stripe_connect_account_id/);
  assert.doesNotMatch(stripeService, /\.from\("profiles"\).*stripe_connect_account_id/s);
});
