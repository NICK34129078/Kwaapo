import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  darkTheme,
  resolveTheme,
  type AppTheme,
  type ThemeMode,
} from "../constants/themeTokens";
import {
  loadThemeMode,
  saveThemeMode,
} from "../services/themePreferenceService";

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  isReady: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleDarkMode: (enabled: boolean) => void;
  isDarkMode: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadThemeMode();
      if (!cancelled) {
        setModeState(stored);
        setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void saveThemeMode(next);
  }, []);

  const toggleDarkMode = useCallback(
    (enabled: boolean) => {
      setMode(enabled ? "dark" : "light");
    },
    [setMode]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme: resolveTheme(mode),
      isReady,
      setMode,
      toggleDarkMode,
      isDarkMode: mode === "dark",
    }),
    [isReady, mode, setMode, toggleDarkMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      mode: "dark",
      theme: darkTheme,
      isReady: true,
      setMode: () => {},
      toggleDarkMode: () => {},
      isDarkMode: true,
    };
  }
  return ctx;
}
