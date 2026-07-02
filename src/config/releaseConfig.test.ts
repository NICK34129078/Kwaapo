import {
  collectProductionReleaseIssues,
  isReleasePlaceholder,
} from "./releaseConfig";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

assert(isReleasePlaceholder("[INVULLEN: https://jouwdomein.nl/privacy]"), "detect INVULLEN");
assert(isReleasePlaceholder("support@jouwdomein.nl"), "detect jouwdomein");
assert(!isReleasePlaceholder("https://kwaapo.nl/privacy"), "valid privacy url");
assert(!isReleasePlaceholder("support@kwaapo.nl"), "valid support email");

const issues = collectProductionReleaseIssues({ requireAppIcon: true, appIconPath: null });
assert(issues.length >= 3, "expect privacy, support, and icon issues with current placeholders");

console.log("releaseConfig tests passed");
