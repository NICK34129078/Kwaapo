export type AppLocale =
  | "nl-NL"
  | "en-US"
  | "en-GB"
  | "de-DE"
  | "fr-FR"
  | "es-ES"
  | "es-MX"
  | "tr-TR"
  | "ar"
  | "ar-MA"
  | "ar-EG"
  | "ar-IQ"
  | "fa-IR"
  | "hr-HR"
  | "ru-RU"
  | "it-IT"
  | "sv-SE"
  | "da-DK"
  | "pap-CW";

export type AppLanguageOption = {
  locale: AppLocale;
  nativeLabel: string;
  subtitle: string;
};

export const DEFAULT_LOCALE: AppLocale = "nl-NL";

export const FALLBACK_LOCALE: AppLocale = "en-US";

export const APP_LANGUAGES: AppLanguageOption[] = [
  { locale: "nl-NL", nativeLabel: "Nederlands", subtitle: "Dutch" },
  {
    locale: "en-US",
    nativeLabel: "English (United States)",
    subtitle: "English (US)",
  },
  {
    locale: "en-GB",
    nativeLabel: "English (United Kingdom)",
    subtitle: "English (UK)",
  },
  { locale: "de-DE", nativeLabel: "Deutsch", subtitle: "German" },
  { locale: "fr-FR", nativeLabel: "Français", subtitle: "French" },
  { locale: "es-ES", nativeLabel: "Español (España)", subtitle: "Spanish (Spain)" },
  { locale: "es-MX", nativeLabel: "Español (México)", subtitle: "Spanish (Mexico)" },
  { locale: "tr-TR", nativeLabel: "Türkçe", subtitle: "Turkish" },
  { locale: "ar", nativeLabel: "العربية", subtitle: "Arabic (Modern Standard)" },
  {
    locale: "ar-MA",
    nativeLabel: "العربية المغربية",
    subtitle: "Moroccan Arabic",
  },
  {
    locale: "ar-EG",
    nativeLabel: "العربية المصرية",
    subtitle: "Egyptian Arabic",
  },
  {
    locale: "ar-IQ",
    nativeLabel: "العربية العراقية",
    subtitle: "Iraqi Arabic",
  },
  { locale: "fa-IR", nativeLabel: "فارسی", subtitle: "Persian / Farsi" },
  { locale: "hr-HR", nativeLabel: "Hrvatski", subtitle: "Croatian" },
  { locale: "ru-RU", nativeLabel: "Русский", subtitle: "Russian" },
  { locale: "it-IT", nativeLabel: "Italiano", subtitle: "Italian" },
  { locale: "sv-SE", nativeLabel: "Svenska", subtitle: "Swedish" },
  { locale: "da-DK", nativeLabel: "Dansk", subtitle: "Danish" },
  { locale: "pap-CW", nativeLabel: "Papiamentu", subtitle: "Papiamentu (Curaçao)" },
];

const LOCALE_SET = new Set<string>(APP_LANGUAGES.map((l) => l.locale));

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return typeof value === "string" && LOCALE_SET.has(value);
}

export function getLanguageOption(
  locale: AppLocale
): AppLanguageOption | undefined {
  return APP_LANGUAGES.find((l) => l.locale === locale);
}

export function getLanguageNativeLabel(locale: AppLocale): string {
  return getLanguageOption(locale)?.nativeLabel ?? locale;
}
