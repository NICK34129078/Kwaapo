import test from "node:test";
import assert from "node:assert/strict";

import {
  LEGAL_ENTITY_PLACEHOLDER_VALUES,
  LEGAL_PLACEHOLDERS,
  RETENTION_PLACEHOLDER_VALUES,
} from "../constants/legalPlaceholders";
import {
  PRIVACY_CHAPTERS,
  PRIVACY_SUMMARY_POINTS,
  REQUIRED_PRIVACY_SECTION_IDS,
  findPrivacyPlaceholdersInContent,
  getPrivacyTocItems,
} from "../constants/privacyPolicyContent";
import {
  INVESTIGATED_NOT_ACTIVE_VENDORS,
  PRIVACY_DATA_MATRIX,
  VERIFIED_PRIVACY_VENDORS,
} from "../constants/privacyDataMatrix";
import { SETTINGS_LEGAL_LINKS } from "../constants/appPolicies";

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

const VENDOR_MENTIONS = [
  "Supabase",
  "Cloudflare",
  "Stripe",
  "Expo",
  "Resend",
  "KVK",
  "Spotify",
];

test("privacy page renders all required chapters", () => {
  assert.equal(PRIVACY_CHAPTERS.length, 25);
  for (const id of REQUIRED_PRIVACY_SECTION_IDS) {
    assert.ok(
      PRIVACY_CHAPTERS.some((chapter) => chapter.id === id),
      `missing ${id}`
    );
  }
});

test("table of contents matches chapter list", () => {
  const toc = getPrivacyTocItems();
  assert.equal(toc.length, 25);
  assert.deepEqual(
    toc.map((item) => item.id),
    PRIVACY_CHAPTERS.map((chapter) => chapter.id)
  );
});

test("summary has six factual bullets", () => {
  assert.equal(PRIVACY_SUMMARY_POINTS.length, 6);
  assert.match(PRIVACY_SUMMARY_POINTS.join(" "), /Stripe/);
  assert.match(PRIVACY_SUMMARY_POINTS.join(" "), /niet aan derden/i);
});

test("settings legal links include privacy with valid route", () => {
  const privacyLink = SETTINGS_LEGAL_LINKS.find((l) => l.policyId === "privacy");
  assert.ok(privacyLink, "privacy link missing in settings");
  for (const link of SETTINGS_LEGAL_LINKS) {
    assert.ok(VALID_POLICY_ROUTES.has(link.policyId));
  }
});

test("toc includes key section ids for scroll tests", () => {
  const ids = getPrivacyTocItems().map((item) => item.id);
  for (const required of [
    "data",
    "purposes",
    "legal-bases",
    "personalization",
    "retention",
    "rights",
  ]) {
    assert.ok(ids.includes(required));
  }
});

test("entity placeholders are discoverable in privacy content", () => {
  const found = findPrivacyPlaceholdersInContent();
  for (const placeholder of LEGAL_ENTITY_PLACEHOLDER_VALUES) {
    assert.ok(
      found.includes(placeholder),
      `entity placeholder missing: ${placeholder}`
    );
  }
});

test("retention placeholders are discoverable in privacy content", () => {
  const found = findPrivacyPlaceholdersInContent();
  for (const placeholder of RETENTION_PLACEHOLDER_VALUES) {
    assert.ok(
      found.includes(placeholder),
      `retention placeholder missing: ${placeholder}`
    );
  }
});

test("verified vendors appear in privacy chapters", () => {
  const text = PRIVACY_CHAPTERS.flatMap((c) =>
    c.blocks.flatMap((b) => {
      if (b.type === "paragraph") return [b.text];
      if (b.type === "subsection")
        return [b.title, ...b.paragraphs, ...(b.bullets ?? [])];
      if (b.type === "bullets" || b.type === "numbered") return b.items;
      if (b.type === "notice") return [b.title, b.body];
      return [];
    })
  ).join(" ");

  for (const vendor of VENDOR_MENTIONS) {
    assert.match(text, new RegExp(vendor, "i"), `vendor not mentioned: ${vendor}`);
  }
});

test("investigated inactive vendors are not claimed as active SDKs", () => {
  const trackingChapter = PRIVACY_CHAPTERS.find((c) => c.id === "tracking");
  assert.ok(trackingChapter);
  const trackingText = JSON.stringify(trackingChapter);
  assert.match(trackingText, /geen IDFA/i);
  assert.match(trackingText, /geen advertentienetwerken/i);
  assert.ok(INVESTIGATED_NOT_ACTIVE_VENDORS.includes("Sentry"));
  assert.ok(VERIFIED_PRIVACY_VENDORS.includes("Supabase"));
});

test("no tracking claim without negation in tracking chapter", () => {
  const tracking = PRIVACY_CHAPTERS.find((c) => c.id === "tracking");
  assert.ok(tracking);
  const body = JSON.stringify(tracking);
  assert.match(body, /geen advertentienetwerken/i);
});

test("data matrix rows have required fields", () => {
  assert.ok(PRIVACY_DATA_MATRIX.length >= 15);
  for (const row of PRIVACY_DATA_MATRIX) {
    assert.ok(row.category);
    assert.ok(row.source);
    assert.ok(row.legalBasis);
    assert.match(row.retention, /\[BEWAARTERMIJN|\[INGANGSDATUM/);
  }
});

test("privacy web url uses domain placeholder", () => {
  assert.match(
    `https://${LEGAL_PLACEHOLDERS.WEB_DOMAIN}/privacy`,
    /\[DOMEIN\]/
  );
});

test("account deletion chapter references real flow", () => {
  const deletion = PRIVACY_CHAPTERS.find((c) => c.id === "deletion");
  assert.ok(deletion);
  const text = JSON.stringify(deletion);
  assert.match(text, /request_account_deletion/);
  assert.match(text, /Instellingen/);
});

test("no location GPS claim", () => {
  const data = PRIVACY_CHAPTERS.find((c) => c.id === "data");
  const text = JSON.stringify(data);
  assert.match(text, /geen GPS/i);
});
