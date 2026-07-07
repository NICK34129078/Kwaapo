import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeMode } from "../constants/themeTokens";

const STORAGE_KEY = "@kwaapo/appearance";

export async function loadThemeMode(): Promise<ThemeMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") {
      return raw;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return "dark";
}

export async function saveThemeMode(mode: ThemeMode): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, mode);
}

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}
