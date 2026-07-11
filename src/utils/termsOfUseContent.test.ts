import test from "node:test";
import assert from "node:assert/strict";

import { LEGAL_PLACEHOLDER_VALUES } from "../constants/legalPlaceholders";
import {
  REQUIRED_TERMS_SECTION_IDS,
  TERMS_CHAPTERS,
  TERMS_SUMMARY_POINTS,
  TERMS_YOUTH_SUMMARY,
  findTermsPlaceholdersInContent,
  getTermsTocItems,
} from "../constants/termsOfUseContent";
import { SETTINGS_LEGAL_LINKS } from "../constants/appPolicies";
import { validateRegistrationConsent } from "./registrationTermsAcceptance";

const VALID_POLICY_ROUTES = new Set([
  "privacy",
  "terms",
  "community",
  "marketplace",
  "seller",
  "prohibited",
  "refunds",
  "copyright",
  "contact",
  "account_deletion",
]);

test("terms page renders all required chapters", () => {
  assert.equal(TERMS_CHAPTERS.length, 27);
  for (const id of REQUIRED_TERMS_SECTION_IDS) {
    assert.ok(TERMS_CHAPTERS.some((chapter) => chapter.id === id), `missing ${id}`);
  }
});

test("table of contents matches chapter list", () => {
  const toc = getTermsTocItems();
  assert.equal(toc.length, 27);
  assert.deepEqual(
    toc.map((item) => item.id),
    TERMS_CHAPTERS.map((chapter) => chapter.id)
  );
});

test("summary has at most six bullets", () => {
  assert.ok(TERMS_SUMMARY_POINTS.length <= 6);
  assert.ok(TERMS_SUMMARY_POINTS.length >= 6);
});

test("youth summary disclaimer states it is not a replacement", () => {
  assert.match(TERMS_YOUTH_SUMMARY.disclaimer.toLowerCase(), /vervangt/);
});

test("registration checkbox defaults fail validation", () => {
  const termsOnly = validateRegistrationConsent({
    acceptedTerms: false,
    confirmedMinimumAge: false,
  });
  assert.equal(termsOnly.ok, false);

  const ageOnly = validateRegistrationConsent({
    acceptedTerms: true,
    confirmedMinimumAge: false,
  });
  assert.equal(ageOnly.ok, false);
});

test("registration blocked without terms and age confirmation", () => {
  const result = validateRegistrationConsent({
    acceptedTerms: false,
    confirmedMinimumAge: true,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message.toLowerCase(), /gebruikersvoorwaarden/);
  }
});

test("registration allowed with both confirmations", () => {
  const result = validateRegistrationConsent({
    acceptedTerms: true,
    confirmedMinimumAge: true,
  });
  assert.equal(result.ok, true);
});

test("settings legal links use valid policy routes", () => {
  for (const link of SETTINGS_LEGAL_LINKS) {
    assert.ok(
      VALID_POLICY_ROUTES.has(link.policyId),
      `invalid policy route: ${link.policyId}`
    );
  }
});

test("terms placeholders are discoverable for release checklist", () => {
  const found = findTermsPlaceholdersInContent();
  for (const placeholder of LEGAL_PLACEHOLDER_VALUES) {
    assert.ok(
      found.includes(placeholder),
      `placeholder missing in terms content: ${placeholder}`
    );
  }
});

test("toc includes key section ids for scroll tests", () => {
  const ids = getTermsTocItems().map((item) => item.id);
  for (const required of ["age", "content", "marketplace", "liability"]) {
    assert.ok(ids.includes(required));
  }
});
