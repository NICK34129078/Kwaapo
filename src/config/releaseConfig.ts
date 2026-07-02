/**
 * Production release gate — blocks EAS production builds when legal/contact placeholders remain.
 */

export const PLACEHOLDER_MARKERS = ["[INVULLEN", "jouwdomein.nl"] as const;

export type ReleaseConfigField = "privacyPolicyWebUrl" | "supportEmail" | "appIcon";

export type ReleaseConfigIssue = {
  field: ReleaseConfigField;
  message: string;
};

/** True when value is empty or still contains a known placeholder marker. */
export function isReleasePlaceholder(value: string | null | undefined): boolean {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker.toLowerCase()));
}

/** Read release-critical values from appPolicies (single source of truth). */
export function getReleaseConfigValues(): {
  privacyPolicyWebUrl: string;
  supportEmail: string;
} {
  // Lazy require avoids circular imports during Metro bundling of appPolicies.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const policies = require("../constants/appPolicies") as {
    PRIVACY_POLICY_WEB_URL: string;
    SUPPORT_EMAIL: string;
  };
  return {
    privacyPolicyWebUrl: policies.PRIVACY_POLICY_WEB_URL,
    supportEmail: policies.SUPPORT_EMAIL,
  };
}

export function collectProductionReleaseIssues(options?: {
  /** When true, also require app icon path in Expo config (EAS prebuild). */
  requireAppIcon?: boolean;
  appIconPath?: string | null;
}): ReleaseConfigIssue[] {
  const issues: ReleaseConfigIssue[] = [];
  const { privacyPolicyWebUrl, supportEmail } = getReleaseConfigValues();

  if (isReleasePlaceholder(privacyPolicyWebUrl)) {
    issues.push({
      field: "privacyPolicyWebUrl",
      message:
        "PRIVACY_POLICY_WEB_URL in src/constants/appPolicies.ts is still a placeholder. Set a live https:// privacy policy URL before production release.",
    });
  } else if (!privacyPolicyWebUrl.startsWith("https://")) {
    issues.push({
      field: "privacyPolicyWebUrl",
      message: "PRIVACY_POLICY_WEB_URL must start with https:// for App Store submission.",
    });
  }

  if (isReleasePlaceholder(supportEmail)) {
    issues.push({
      field: "supportEmail",
      message:
        "SUPPORT_EMAIL in src/constants/appPolicies.ts is still a placeholder. Set a real support inbox before production release.",
    });
  } else if (!supportEmail.includes("@")) {
    issues.push({
      field: "supportEmail",
      message: "SUPPORT_EMAIL must be a valid e-mail address.",
    });
  }

  if (options?.requireAppIcon && !options.appIconPath) {
    issues.push({
      field: "appIcon",
      message:
        'app.json is missing "icon": "./assets/icon.png". Add a 1024×1024 PNG before production release (see docs/IOS_VISUAL_RELEASE_ASSETS.md).',
    });
  }

  return issues;
}

/** Throws with a readable error when production release config is incomplete. */
export function assertProductionReleaseReady(options?: {
  requireAppIcon?: boolean;
  appIconPath?: string | null;
}): void {
  const issues = collectProductionReleaseIssues(options);
  if (issues.length === 0) {
    return;
  }
  const lines = issues.map((i) => `- ${i.message}`).join("\n");
  throw new Error(
    `Production release blocked — complete release configuration first:\n${lines}`
  );
}
