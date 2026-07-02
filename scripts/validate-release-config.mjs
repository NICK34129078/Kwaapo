/**
 * CLI release gate for EAS production builds.
 * Usage: node scripts/validate-release-config.mjs
 *        EAS_BUILD_PROFILE=production node scripts/validate-release-config.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const PLACEHOLDER_MARKERS = ["[INVULLEN", "jouwdomein.nl"];

function isReleasePlaceholder(value) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

function readAppPolicies() {
  const file = path.join(root, "src/constants/appPolicies.ts");
  const content = fs.readFileSync(file, "utf8");
  const privacyMatch = content.match(
    /export const PRIVACY_POLICY_WEB_URL = "([^"]*)"/
  );
  const supportMatch = content.match(/export const SUPPORT_EMAIL = "([^"]*)"/);
  return {
    privacyPolicyWebUrl: privacyMatch?.[1] ?? "",
    supportEmail: supportMatch?.[1] ?? "",
  };
}

function readAppJsonIcon() {
  const file = path.join(root, "app.json");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return json?.expo?.icon ?? null;
}

export function collectProductionReleaseIssues({ requireAppIcon = true } = {}) {
  const issues = [];
  const { privacyPolicyWebUrl, supportEmail } = readAppPolicies();

  if (isReleasePlaceholder(privacyPolicyWebUrl)) {
    issues.push(
      "PRIVACY_POLICY_WEB_URL in src/constants/appPolicies.ts is still a placeholder."
    );
  } else if (!privacyPolicyWebUrl.startsWith("https://")) {
    issues.push("PRIVACY_POLICY_WEB_URL must start with https://.");
  }

  if (isReleasePlaceholder(supportEmail)) {
    issues.push(
      "SUPPORT_EMAIL in src/constants/appPolicies.ts is still a placeholder."
    );
  } else if (!supportEmail.includes("@")) {
    issues.push("SUPPORT_EMAIL must contain @.");
  }

  if (requireAppIcon && !readAppJsonIcon()) {
    issues.push(
      'app.json missing "icon" — add ./assets/icon.png (1024×1024) before production release.'
    );
  }

  return issues;
}

export function assertProductionReleaseReady(options) {
  const issues = collectProductionReleaseIssues(options);
  if (issues.length === 0) {
    return;
  }
  const body = issues.map((line) => `  - ${line}`).join("\n");
  throw new Error(
    `Production release blocked — complete release configuration first:\n${body}`
  );
}

const profile = process.env.EAS_BUILD_PROFILE ?? process.argv[2] ?? "check";

if (profile === "production") {
  try {
    assertProductionReleaseReady({ requireAppIcon: true });
    console.log("validate-release-config: production checks passed");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
} else if (profile === "check") {
  const issues = collectProductionReleaseIssues({ requireAppIcon: true });
  if (issues.length === 0) {
    console.log("validate-release-config: no blocking issues (production-ready)");
  } else {
    console.log("validate-release-config: pending items before production:");
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
}
