import { useMemo } from "react";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";

export function useThemedStyles<T>(
  createStyles: (theme: AppTheme) => T,
  deps: readonly unknown[] = []
): T {
  const { theme } = useTheme();
  return useMemo(() => createStyles(theme), [createStyles, theme, ...deps]);
}
