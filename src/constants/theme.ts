/** Accent: licht pastelblauw (referentie uit app-design). */
const ACCENT_HEX = "#B9D9F7";
const ACCENT_RGB = "185, 217, 247";

export const theme = {
  bg: "#0B0B0B",
  bgElevated: "#121212",
  text: "#FFFFFF",
  textMuted: "rgba(255,255,255,0.55)",
  accent: ACCENT_HEX,
  accentSoft: `rgba(${ACCENT_RGB}, 0.22)`,
  accentGlow: `rgba(${ACCENT_RGB}, 0.45)`,
  accentFaint: `rgba(${ACCENT_RGB}, 0.08)`,
  accentLight: `rgba(${ACCENT_RGB}, 0.10)`,
  accentMedium: `rgba(${ACCENT_RGB}, 0.16)`,
  accentBorder: `rgba(${ACCENT_RGB}, 0.35)`,
  accentBorderStrong: `rgba(${ACCENT_RGB}, 0.45)`,
  accentBorderMuted: `rgba(${ACCENT_RGB}, 0.55)`,
  overlay: "rgba(0,0,0,0.35)",
  border: "rgba(255,255,255,0.08)",
  navBlur: "rgba(11, 11, 11, 0.72)",
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
} as const;
