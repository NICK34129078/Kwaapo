import { useMemo } from "react";
import type { TextStyle, ViewStyle } from "react-native";
import { useLanguage } from "../context/LanguageContext";

export function useChevronForward(): "chevron-forward" | "chevron-back" {
  const { isRtl } = useLanguage();
  return isRtl ? "chevron-back" : "chevron-forward";
}

export function useRtlTextAlign(): TextStyle {
  const { isRtl } = useLanguage();
  return useMemo(
    () => ({ textAlign: isRtl ? "right" : "left" }),
    [isRtl]
  );
}

export function useRowDirection(): ViewStyle {
  const { isRtl } = useLanguage();
  return useMemo(
    () => ({ flexDirection: isRtl ? "row-reverse" : "row" }),
    [isRtl]
  );
}
