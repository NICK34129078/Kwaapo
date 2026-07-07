import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";

export type SellerShipChecklistState = {
  productChecked: boolean;
  buyerChecked: boolean;
  addressChecked: boolean;
  shippedConfirmed: boolean;
};

export const EMPTY_SELLER_SHIP_CHECKLIST: SellerShipChecklistState = {
  productChecked: false,
  buyerChecked: false,
  addressChecked: false,
  shippedConfirmed: false,
};

type SellerShipChecklistProps = {
  value: SellerShipChecklistState;
  onChange: (next: SellerShipChecklistState) => void;
};

const ITEMS: Array<{
  key: keyof SellerShipChecklistState;
  label: string;
}> = [
  {
    key: "productChecked",
    label: "Ik heb gecontroleerd dat dit het juiste product is (inclusief maat/variant).",
  },
  {
    key: "buyerChecked",
    label: "Ik heb gecontroleerd dat dit pakket voor de juiste koper is.",
  },
  {
    key: "addressChecked",
    label: "Ik heb gecontroleerd dat ik het pakket naar het juiste afleveradres stuur.",
  },
  {
    key: "shippedConfirmed",
    label: "Ik bevestig dat het pakket daadwerkelijk is afgegeven of verzonden.",
  },
];

export function isSellerShipChecklistComplete(
  value: SellerShipChecklistState
): boolean {
  return (
    value.productChecked &&
    value.buyerChecked &&
    value.addressChecked &&
    value.shippedConfirmed
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: theme.accentSoft,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorderStrong,
      marginBottom: 14,
      gap: 8,
    },
    title: {
      color: theme.accent,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    intro: {
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: "600",
    },
    sectionLabel: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 4,
    },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 4,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.accentBorder,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
      backgroundColor: theme.bg,
    },
    boxChecked: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    rowLabel: {
      flex: 1,
      color: theme.text,
      fontSize: 14,
      lineHeight: 20,
    },
    trackingHint: {
      color: theme.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
  });
}

export function SellerShipChecklist({ value, onChange }: SellerShipChecklistProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Klaar om te verzenden</Text>
      <Text style={styles.intro}>
        Deze bestelling is betaald. Jij bent als verkoper verantwoordelijk voor het
        zorgvuldig versturen van het juiste product naar het juiste afleveradres.
      </Text>
      <Text style={styles.sectionLabel}>Controleer vóór verzending:</Text>
      {ITEMS.map((item) => {
        const checked = value[item.key];
        return (
          <Pressable
            key={item.key}
            style={styles.row}
            onPress={() => onChange({ ...value, [item.key]: !checked })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={item.label}
          >
            <View style={[styles.box, checked && styles.boxChecked]}>
              {checked ? (
                <Ionicons name="checkmark" size={16} color={theme.bg} />
              ) : null}
            </View>
            <Text style={styles.rowLabel}>{item.label}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.trackingHint}>
        Trackingcode is aanbevolen maar niet verplicht.
      </Text>
    </View>
  );
}
