/**
 * @deprecated Gebruik `useTheme()` uit ThemeContext voor dynamische kleuren.
 * Statische export blijft dark als fallback voor legacy imports.
 */
export { darkTheme as theme, spacing } from "./themeTokens";

export type { AppTheme, ThemeMode } from "./themeTokens";
