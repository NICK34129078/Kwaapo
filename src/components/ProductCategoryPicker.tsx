import React, { useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { StyleSheet, Text, View } from "react-native";
import { categoryRequiresAudience } from "../constants/productSizePresets";
import {
  legacyCategoryLabelFromCodes,
  SHOP_AUDIENCES,
  SHOP_MAIN_CATEGORIES,
  SHOP_SUBCATEGORIES,
  type ShopAudienceCode,
  type ShopMainCategoryCode,
} from "../constants/shopCategories";
import { ChoiceCard, ChoiceCardGrid } from "./ChoiceCardGrid";

export type ProductCategorySection = "main" | "audience" | "type";

type Props = {
  mainCategory: ShopMainCategoryCode | null;
  audience: ShopAudienceCode | null;
  subcategory: string | null;
  onMainCategoryChange: (code: ShopMainCategoryCode | null) => void;
  onAudienceChange: (code: ShopAudienceCode | null) => void;
  onSubcategoryChange: (code: string | null) => void;
  /** Wizard: toon alleen dit onderdeel. Compact: automatische stap-voor-stap. */
  section?: ProductCategorySection;
};

export function ProductCategoryPicker({
  mainCategory,
  audience,
  subcategory,
  onMainCategoryChange,
  onAudienceChange,
  onSubcategoryChange,
  section,
}: Props) {
  const styles = useThemedStyles(createStyles);

  const mainDef = useMemo(
    () => SHOP_MAIN_CATEGORIES.find((c) => c.code === mainCategory),
    [mainCategory]
  );

  const autoStep: ProductCategorySection = useMemo(() => {
    if (!mainCategory) {
      return "main";
    }
    if (categoryRequiresAudience(mainCategory) && !audience) {
      return "audience";
    }
    return "type";
  }, [audience, mainCategory]);

  const visibleSection = section ?? autoStep;
  const subcategories = mainCategory ? SHOP_SUBCATEGORIES[mainCategory] : [];

  const onPickMain = useCallback(
    (code: ShopMainCategoryCode) => {
      if (code === mainCategory) {
        onMainCategoryChange(null);
        onAudienceChange(null);
        onSubcategoryChange(null);
        return;
      }
      onMainCategoryChange(code);
      onAudienceChange(null);
      onSubcategoryChange(null);
    },
    [mainCategory, onAudienceChange, onMainCategoryChange, onSubcategoryChange]
  );

  const sectionTitle =
    visibleSection === "main"
      ? "Kies een categorie"
      : visibleSection === "audience"
        ? "Voor wie is dit product?"
        : "Welk product verkoop je?";

  const summaryLine =
    mainDef && visibleSection === "type"
      ? `${mainDef.label}${audience ? ` · ${SHOP_AUDIENCES.find((a) => a.code === audience)?.label ?? audience}` : ""}`
      : null;

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>{sectionTitle}</Text>
      {summaryLine ? <Text style={styles.summary}>{summaryLine}</Text> : null}

      {visibleSection === "main" ? (
        <ChoiceCardGrid>
          {SHOP_MAIN_CATEGORIES.map((item) => (
            <ChoiceCard
              key={item.code}
              label={item.label}
              selected={mainCategory === item.code}
              onPress={() => onPickMain(item.code)}
              variant="main"
            />
          ))}
        </ChoiceCardGrid>
      ) : null}

      {visibleSection === "audience" && mainDef ? (
        <ChoiceCardGrid>
          {SHOP_AUDIENCES.map((item) => (
            <ChoiceCard
              key={item.code}
              label={item.label}
              selected={audience === item.code}
              onPress={() => {
                onAudienceChange(item.code);
                onSubcategoryChange(null);
              }}
            />
          ))}
        </ChoiceCardGrid>
      ) : null}

      {visibleSection === "type" ? (
        <ChoiceCardGrid>
          {subcategories.map((item) => (
            <ChoiceCard
              key={item.code}
              label={item.label}
              selected={subcategory === item.code}
              onPress={() =>
                onSubcategoryChange(subcategory === item.code ? null : item.code)
              }
            />
          ))}
        </ChoiceCardGrid>
      ) : null}
    </View>
  );
}

export function buildCategoryPayload(
  mainCategory: ShopMainCategoryCode | null,
  audience: ShopAudienceCode | null,
  subcategory: string | null
): {
  mainCategory: string | null;
  audience: string | null;
  subcategory: string | null;
  category: string | null;
} {
  return {
    mainCategory,
    audience,
    subcategory: subcategory ?? (mainCategory ? "other" : null),
    category: legacyCategoryLabelFromCodes(mainCategory, audience, subcategory),
  };
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    gap: 14,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 28,
  },
  summary: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: -6,
  },
});
}

