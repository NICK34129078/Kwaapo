import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
} from "../i18n/languages";

const STORAGE_KEY = "@kwaapo/language";

export async function loadLanguagePreference(): Promise<AppLocale> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (isAppLocale(raw)) {
      return raw;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_LOCALE;
}

export async function saveLanguagePreference(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
}
