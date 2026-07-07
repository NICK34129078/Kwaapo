import { Alert, I18nManager, Platform } from "react-native";
import type { AppLocale } from "./languages";
import i18n from "./index";

const RTL_LOCALES = new Set<AppLocale | string>([
  "ar",
  "ar-MA",
  "ar-EG",
  "ar-IQ",
  "fa-IR",
]);

export function isRtlLocale(locale: string): boolean {
  if (RTL_LOCALES.has(locale)) {
    return true;
  }
  const base = locale.split("-")[0];
  return base === "ar" || base === "fa";
}

let lastAppliedRtl: boolean | null = null;

export function applyLayoutDirection(locale: string): boolean {
  const shouldRtl = isRtlLocale(locale);
  if (lastAppliedRtl === shouldRtl) {
    return shouldRtl;
  }

  I18nManager.allowRTL(shouldRtl);
  I18nManager.swapLeftAndRightInRTL(shouldRtl);

  if (I18nManager.isRTL !== shouldRtl) {
    try {
      I18nManager.forceRTL(shouldRtl);
    } catch {
      /* noop on web */
    }
  }

  lastAppliedRtl = shouldRtl;

  if (
    shouldRtl &&
    Platform.OS !== "web" &&
    I18nManager.isRTL !== shouldRtl
  ) {
    Alert.alert(
      i18n.t("language.rtlRestartTitle"),
      i18n.t("language.rtlRestartMessage")
    );
  }

  return shouldRtl;
}
