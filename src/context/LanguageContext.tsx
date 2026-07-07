import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { I18nextProvider } from "react-i18next";
import {
  DEFAULT_LOCALE,
  getLanguageNativeLabel,
  type AppLocale,
} from "../i18n/languages";
import i18n, { initI18n } from "../i18n/index";
import { applyLayoutDirection, isRtlLocale } from "../i18n/rtl";
import {
  loadLanguagePreference,
  saveLanguagePreference,
} from "../services/languagePreferenceService";

type LanguageContextValue = {
  locale: AppLocale;
  isReady: boolean;
  isRtl: boolean;
  setLocale: (locale: AppLocale) => Promise<void>;
  nativeLabel: string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(DEFAULT_LOCALE);
  const [isReady, setIsReady] = useState(false);
  const [isRtl, setIsRtl] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadLanguagePreference();
      initI18n(stored);
      const rtl = applyLayoutDirection(stored);
      if (!cancelled) {
        setLocaleState(stored);
        setIsRtl(rtl);
        setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: AppLocale) => {
    initI18n(next);
    await i18n.changeLanguage(next);
    const rtl = applyLayoutDirection(next);
    setLocaleState(next);
    setIsRtl(rtl);
    await saveLanguagePreference(next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      isReady,
      isRtl,
      setLocale,
      nativeLabel: getLanguageNativeLabel(locale),
    }),
    [isReady, isRtl, locale, setLocale]
  );

  if (!isReady) {
    return null;
  }

  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      isReady: true,
      isRtl: isRtlLocale(DEFAULT_LOCALE),
      setLocale: async () => {},
      nativeLabel: getLanguageNativeLabel(DEFAULT_LOCALE),
    };
  }
  return ctx;
}
