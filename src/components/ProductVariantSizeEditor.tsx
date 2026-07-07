import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import {
  getSizeMode,
  sizePresetsForSizeMode,
} from "../constants/productSizePresets";
import type { ShopAudienceCode, ShopMainCategoryCode } from "../constants/shopCategories";
import type { VariantStockInput } from "../types/productVariant";

export type VariantStockMap = Record<string, number>;

type Props = {
  mainCategory: ShopMainCategoryCode | null;
  audience?: ShopAudienceCode | null;
  subcategory?: string | null;
  value: VariantStockMap;
  onChange: (next: VariantStockMap) => void;
};

function totalStock(map: VariantStockMap): number {
  return Object.values(map).reduce((sum, n) => sum + Math.max(0, n), 0);
}

export function variantMapToInputs(map: VariantStockMap): VariantStockInput[] {
  return Object.entries(map).map(([optionValue, stock]) => ({
    optionValue,
    stock: Math.max(0, stock),
  }));
}

function StockStepperRow({
  size,
  stock,
  onChangeStock,
}: {
  size: string;
  stock: number;
  onChangeStock: (next: number) => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const adjust = useCallback(
    (delta: number) => {
      onChangeStock(Math.max(0, stock + delta));
    },
    [onChangeStock, stock]
  );

  const onTypeStock = useCallback(
    (text: string) => {
      const parsed = parseInt(text.replace(/\D/g, ""), 10);
      if (text.trim() === "") {
        onChangeStock(0);
        return;
      }
      if (Number.isFinite(parsed)) {
        onChangeStock(Math.max(0, parsed));
      }
    },
    [onChangeStock]
  );

  return (
    <View style={styles.stockRow}>
      <View style={styles.stockRowHead}>
        <Text style={styles.sizeLabel}>{size}</Text>
        {stock <= 0 ? (
          <Text style={styles.outBadge}>Uitverkocht</Text>
        ) : null}
      </View>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepBtn, stock <= 0 && styles.stepBtnDisabled]}
          onPress={() => adjust(-1)}
          disabled={stock <= 0}
          accessibilityLabel={`Minder maat ${size}`}
        >
          <Ionicons name="remove" size={24} color={theme.text} />
        </Pressable>
        <TextInput
          style={styles.stockInput}
          value={String(stock)}
          onChangeText={onTypeStock}
          keyboardType="number-pad"
          selectTextOnFocus
          maxLength={5}
          accessibilityLabel={`Voorraad maat ${size}`}
        />
        <Pressable
          style={styles.stepBtn}
          onPress={() => adjust(1)}
          accessibilityLabel={`Meer maat ${size}`}
        >
          <Ionicons name="add" size={24} color={theme.text} />
        </Pressable>
      </View>
    </View>
  );
}

export function ProductVariantSizeEditor({
  mainCategory,
  audience = null,
  subcategory = null,
  value,
  onChange,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const sizeMode = getSizeMode(mainCategory, subcategory);
  const presets = useMemo(
    () => [...sizePresetsForSizeMode(sizeMode, audience)],
    [audience, sizeMode]
  );
  const [customModal, setCustomModal] = useState(false);
  const [customText, setCustomText] = useState("");

  const selectedKeys = useMemo(
    () => Object.keys(value).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [value]
  );

  const togglePreset = useCallback(
    (size: string) => {
      const next = { ...value };
      if (size in next) {
        delete next[size];
      } else {
        next[size] = 0;
      }
      onChange(next);
    },
    [onChange, value]
  );

  const setStock = useCallback(
    (size: string, nextVal: number) => {
      onChange({ ...value, [size]: Math.max(0, nextVal) });
    },
    [onChange, value]
  );

  const addCustomSize = useCallback(() => {
    const label = customText.trim();
    if (!label) {
      Alert.alert("Maat ontbreekt", "Vul een maat in.");
      return;
    }
    if (label in value) {
      Alert.alert("Maat bestaat al", "Deze maat staat al in je lijst.");
      return;
    }
    onChange({ ...value, [label]: 0 });
    setCustomText("");
    setCustomModal(false);
  }, [customText, onChange, value]);

  return (
    <View style={styles.root}>
      <Text style={styles.blockTitle}>Kies de maten die je verkoopt</Text>
      <Text style={styles.blockHint}>Tik op een maat om die toe te voegen of te verwijderen.</Text>

      <View style={styles.presetGrid}>
        {presets.map((size) => {
          const selected = size in value;
          return (
            <Pressable
              key={size}
              style={[styles.sizeBlock, selected && styles.sizeBlockSelected]}
              onPress={() => togglePreset(size)}
              accessibilityRole="button"
              accessibilityLabel={`Maat ${size}${selected ? ", geselecteerd" : ""}`}
            >
              <Text
                style={[styles.sizeBlockText, selected && styles.sizeBlockTextSelected]}
              >
                {size}
              </Text>
              {selected ? (
                <View style={styles.checkMark}>
                  <Ionicons name="checkmark" size={12} color={theme.bg} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.customSizeBtn} onPress={() => setCustomModal(true)}>
        <Ionicons name="add" size={20} color={theme.accent} />
        <Text style={styles.customSizeBtnText}>Eigen maat toevoegen</Text>
      </Pressable>

      {selectedKeys.length > 0 ? (
        <>
          <View style={styles.selectedBlock}>
            <Text style={styles.blockTitle}>Geselecteerde maten</Text>
            <View style={styles.selectedRow}>
              {selectedKeys.map((size) => (
                <View key={size} style={styles.selectedChip}>
                  <Text style={styles.selectedChipText}>{size}</Text>
                  <Ionicons name="checkmark-circle" size={16} color={theme.accent} />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.stockCard}>
            <Text style={styles.stockCardTitle}>Voorraad per maat</Text>
            {selectedKeys.map((size) => (
              <StockStepperRow
                key={size}
                size={size}
                stock={value[size] ?? 0}
                onChangeStock={(n) => setStock(size, n)}
              />
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Totaal op voorraad</Text>
              <Text style={styles.totalValue}>{totalStock(value)}</Text>
            </View>
          </View>
        </>
      ) : null}

      <Modal visible={customModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Eigen maat toevoegen</Text>
            <Text style={styles.modalHint}>
              Bijvoorbeeld: One size, 28/32, 46 of 3-6 maanden
            </Text>
            <TextInput
              style={styles.modalInput}
              value={customText}
              onChangeText={setCustomText}
              placeholder="Jouw maat"
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={() => setCustomModal(false)}>
                <Text style={styles.modalBtnText}>Annuleren</Text>
              </Pressable>
              <Pressable style={styles.modalBtn} onPress={addCustomSize}>
                <Text style={styles.modalBtnPrimaryText}>Toevoegen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const SIZE_BLOCK_MIN = 52;

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: { gap: 16, marginTop: 4 },
  blockTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
  },
  blockHint: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: -8,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sizeBlock: {
    minWidth: SIZE_BLOCK_MIN,
    minHeight: SIZE_BLOCK_MIN,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },
  sizeBlockSelected: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderMuted,
  },
  sizeBlockText: {
    color: theme.textMuted,
    fontWeight: "800",
    fontSize: 16,
  },
  sizeBlockTextSelected: {
    color: theme.accent,
  },
  checkMark: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  customSizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderMuted,
    backgroundColor: theme.accentSoft,
  },
  customSizeBtnText: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 15,
  },
  selectedBlock: { gap: 10 },
  selectedRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selectedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderMuted,
  },
  selectedChipText: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 14,
  },
  stockCard: {
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  stockCardTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  stockRow: {
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  stockRowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sizeLabel: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 18,
  },
  outBadge: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  stockInput: {
    minWidth: 56,
    height: 48,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 4,
  },
  totalLabel: {
    color: theme.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  totalValue: {
    color: theme.accent,
    fontWeight: "900",
    fontSize: 20,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: theme.bgElevated,
    borderRadius: 18,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 10,
  },
  modalTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 18,
  },
  modalHint: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 16,
    marginTop: 4,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 16,
    marginTop: 8,
  },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 4 },
  modalBtnText: { color: theme.textMuted, fontWeight: "700", fontSize: 15 },
  modalBtnPrimaryText: { color: theme.accent, fontWeight: "800", fontSize: 15 },
  });
}
