export type ThemeMode = "dark" | "light";

export type AppTheme = {
  bg: string;
  bgElevated: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  accentFaint: string;
  accentLight: string;
  accentMedium: string;
  accentBorder: string;
  accentBorderStrong: string;
  accentBorderMuted: string;
  overlay: string;
  border: string;
  navBlur: string;
  inputBackground: string;
  inputText: string;
  placeholder: string;
  icon: string;
  iconMuted: string;
  accentText: string;
  danger: string;
  success: string;
  warning: string;
  tabBarBg: string;
  tabBarActive: string;
  tabBarInactive: string;
  switchTrackFalse: string;
  switchTrackTrue: string;
  statusBarStyle: "light" | "dark";
  /** Tekst/iconen boven foto/video — altijd licht (onafhankelijk van app-thema). */
  onMediaText: string;
  onMediaTextMuted: string;
  onMediaTextSecondary: string;
  onMediaIcon: string;
};

const ACCENT_HEX = "#B9D9F7";
const ACCENT_RGB = "185, 217, 247";

const ON_MEDIA = {
  onMediaText: "#FFFFFF",
  onMediaTextMuted: "rgba(255,255,255,0.55)",
  onMediaTextSecondary: "rgba(255,255,255,0.78)",
  onMediaIcon: "#FFFFFF",
} as const;

function accentTokens(isLight: boolean): Pick<
  AppTheme,
  | "accent"
  | "accentSoft"
  | "accentGlow"
  | "accentFaint"
  | "accentLight"
  | "accentMedium"
  | "accentBorder"
  | "accentBorderStrong"
  | "accentBorderMuted"
  | "accentText"
> {
  const softAlpha = isLight ? 0.28 : 0.22;
  const borderAlpha = isLight ? 0.42 : 0.35;
  return {
    accent: ACCENT_HEX,
    accentSoft: `rgba(${ACCENT_RGB}, ${softAlpha})`,
    accentGlow: `rgba(${ACCENT_RGB}, 0.45)`,
    accentFaint: `rgba(${ACCENT_RGB}, ${isLight ? 0.12 : 0.08})`,
    accentLight: `rgba(${ACCENT_RGB}, ${isLight ? 0.14 : 0.10})`,
    accentMedium: `rgba(${ACCENT_RGB}, ${isLight ? 0.2 : 0.16})`,
    accentBorder: `rgba(${ACCENT_RGB}, ${borderAlpha})`,
    accentBorderStrong: `rgba(${ACCENT_RGB}, 0.45)`,
    accentBorderMuted: `rgba(${ACCENT_RGB}, ${isLight ? 0.62 : 0.55})`,
    accentText: isLight ? "#0B0B0B" : "#0B0B0B",
  };
}

export const darkTheme: AppTheme = {
  bg: "#0B0B0B",
  bgElevated: "#121212",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.55)",
  overlay: "rgba(0,0,0,0.35)",
  border: "rgba(255,255,255,0.08)",
  navBlur: "rgba(11, 11, 11, 0.72)",
  inputBackground: "#121212",
  inputText: "#FFFFFF",
  placeholder: "rgba(255,255,255,0.55)",
  icon: "#FFFFFF",
  iconMuted: "rgba(255,255,255,0.55)",
  danger: "#ff8a84",
  success: "#7dcea0",
  warning: "#f5c542",
  tabBarBg: "#000000",
  tabBarActive: "#FFFFFF",
  tabBarInactive: "rgba(255,255,255,0.45)",
  switchTrackFalse: "#3A3A3C",
  switchTrackTrue: ACCENT_HEX,
  statusBarStyle: "light",
  ...ON_MEDIA,
  ...accentTokens(false),
};

export const lightTheme: AppTheme = {
  bg: "#FFFFFF",
  bgElevated: "#F5F5F7",
  text: "#0B0B0B",
  textMuted: "rgba(11,11,11,0.55)",
  overlay: "rgba(0,0,0,0.35)",
  border: "rgba(0,0,0,0.08)",
  navBlur: "rgba(255, 255, 255, 0.92)",
  inputBackground: "#F5F5F7",
  inputText: "#0B0B0B",
  placeholder: "rgba(11,11,11,0.45)",
  icon: "#0B0B0B",
  iconMuted: "rgba(11,11,11,0.55)",
  danger: "#D64545",
  success: "#2E8B57",
  warning: "#B8860B",
  tabBarBg: "#FFFFFF",
  tabBarActive: "#0B0B0B",
  tabBarInactive: "rgba(11,11,11,0.45)",
  switchTrackFalse: "#E5E5EA",
  switchTrackTrue: ACCENT_HEX,
  statusBarStyle: "dark",
  ...ON_MEDIA,
  ...accentTokens(true),
};

export function resolveTheme(mode: ThemeMode): AppTheme {
  return mode === "light" ? lightTheme : darkTheme;
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
} as const;
