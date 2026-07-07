import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  APP_LANGUAGES,
  DEFAULT_LOCALE,
  FALLBACK_LOCALE,
  type AppLocale,
} from "./languages";
import nl from "./locales/nl.json";
import enUS from "./locales/en-US.json";
import deDE from "./locales/de-DE.json";

const primaryBundles: Record<string, object> = {
  "nl-NL": nl,
  "en-US": enUS,
  "de-DE": deDE,
};

function bundleForLocale(locale: AppLocale): object {
  if (primaryBundles[locale]) {
    return primaryBundles[locale];
  }
  const base = locale.split("-")[0];
  if (base === "nl" && primaryBundles["nl-NL"]) {
    return primaryBundles["nl-NL"];
  }
  if (base === "de" && primaryBundles["de-DE"]) {
    return primaryBundles["de-DE"];
  }
  return enUS;
}

const resources = Object.fromEntries(
  APP_LANGUAGES.map((lang) => [
    lang.locale,
    { translation: bundleForLocale(lang.locale) },
  ])
);

let initialized = false;

export function initI18n(locale: AppLocale = DEFAULT_LOCALE): typeof i18n {
  if (initialized) {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    return i18n;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: [FALLBACK_LOCALE, DEFAULT_LOCALE],
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    compatibilityJSON: "v4",
    react: { useSuspense: false },
  });

  initialized = true;
  return i18n;
}

export default i18n;
