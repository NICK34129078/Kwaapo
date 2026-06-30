import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { productMayUsePerSizeStock } from "../constants/productSizePresets";
import type { Product } from "../types/product";
import type { ProductVariant } from "../types/productVariant";
import {
  activateProductVariants,
  adjustProductVariantStock,
  enableProductVariantsDraft,
  fetchProductVariants,
  saveProductVariantStocks,
} from "../services/productVariantService";
import { fetchProductStockHistory } from "../services/productStockService";
import { formatStockHistoryLine } from "../utils/productStock";
import {
  ProductVariantSizeEditor,
  variantMapToInputs,
  type VariantStockMap,
} from "./ProductVariantSizeEditor";

type Props = {
  product: Product;
  onProductStockChanged: (totalStock: number) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function ProductVariantStockSection({
  product,
  onProductStockChanged,
  onPendingChange,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [migrationMap, setMigrationMap] = useState<VariantStockMap>({});
  const [showMigrationEditor, setShowMigrationEditor] = useState(false);
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [history, setHistory] = useState<
    Awaited<ReturnType<typeof fetchProductStockHistory>>
  >([]);
  const [modalVariant, setModalVariant] = useState<ProductVariant | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "set" | null>(null);
  const [modalInput, setModalInput] = useState("");

  const canOfferMigration = useMemo(
    () =>
      !migrationDismissed &&
      productMayUsePerSizeStock(
        product.mainCategory,
        product.subcategory,
        product.sizes
      ) &&
      !product.variantsReady &&
      !product.usesVariants,
    [migrationDismissed, product]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchProductVariants(product.id, { sellerView: true });
      setVariants(rows);
      const hist = await fetchProductStockHistory(product.id, 5);
      setHistory(hist);
      if (product.variantsReady) {
        onProductStockChanged(rows.reduce((s, v) => s + v.stock, 0));
      }
    } catch {
      setVariants([]);
    } finally {
      setLoading(false);
    }
  }, [onProductStockChanged, product.id, product.variantsReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const startMigration = useCallback(() => {
    const draft: VariantStockMap = {};
    for (const size of product.sizes) {
      draft[size] = 0;
    }
    setMigrationMap(draft);
    setShowMigrationEditor(true);
  }, [product.sizes]);

  const confirmMigrationDraft = useCallback(async () => {
    const keys = Object.keys(migrationMap);
    if (keys.length === 0) {
      Alert.alert("Geen maten", "Kies minimaal één maat.");
      return;
    }
    setBusy(true);
    try {
      await enableProductVariantsDraft(product.id, keys);
      await saveProductVariantStocks(product.id, variantMapToInputs(migrationMap));
      const total = Object.values(migrationMap).reduce((s, n) => s + n, 0);
      if (total <= 0) {
        Alert.alert(
          "Voorraad invullen",
          "Stel per maat een voorraad in voordat je activeert."
        );
        setBusy(false);
        await load();
        return;
      }
      await activateProductVariants(product.id);
      setShowMigrationEditor(false);
      await load();
      Alert.alert(
        "Voorraad per maat actief",
        "Je totale voorraad is nu gebaseerd op je maten."
      );
    } catch (e) {
      Alert.alert("Fout", e instanceof Error ? e.message : "Instellen mislukt.");
    } finally {
      setBusy(false);
    }
  }, [load, migrationMap, product.id]);

  const openVariantModal = useCallback(
    (variant: ProductVariant, mode: "add" | "set") => {
      setModalVariant(variant);
      setModalMode(mode);
      setModalInput(mode === "set" ? String(variant.stock) : "");
      onPendingChange?.(true);
    },
    [onPendingChange]
  );

  const closeModal = useCallback(() => {
    setModalVariant(null);
    setModalMode(null);
    setModalInput("");
    onPendingChange?.(false);
  }, [onPendingChange]);

  const confirmVariantModal = useCallback(async () => {
    if (!modalVariant || !modalMode) {
      return;
    }
    const value = parseInt(modalInput.replace(/\D/g, ""), 10);
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert("Ongeldig aantal", "Vul een geldig aantal in.");
      return;
    }
    if (modalMode === "add" && value <= 0) {
      Alert.alert("Ongeldig aantal", "Vul een positief aantal in om toe te voegen.");
      return;
    }
    setBusy(true);
    try {
      const result = await adjustProductVariantStock(modalVariant.id, modalMode, value);
      closeModal();
      await load();
      Alert.alert(
        "Voorraad bijgewerkt",
        modalMode === "add"
          ? `Je hebt nu ${result.stockAfter} stuks in maat ${result.optionValue}.`
          : `Maat ${result.optionValue} staat nu op ${result.stockAfter}.`
      );
    } catch (e) {
      Alert.alert("Fout", e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }, [closeModal, load, modalInput, modalMode, modalVariant]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="small" color={theme.accent} />
      </View>
    );
  }

  if (canOfferMigration && !showMigrationEditor) {
    return (
      <View style={styles.migrationCard}>
        <Text style={styles.migrationTitle}>Wil je voorraad per maat bijhouden?</Text>
        <Text style={styles.migrationText}>
          Zo voorkom je dat je een maat verkoopt die niet meer beschikbaar is.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={startMigration} disabled={busy}>
          <Text style={styles.primaryBtnText}>Voorraad per maat instellen</Text>
        </Pressable>
        <Pressable
          style={styles.ghostBtn}
          onPress={() => setMigrationDismissed(true)}
          disabled={busy}
        >
          <Text style={styles.ghostBtnText}>Eén totale voorraad blijven gebruiken</Text>
        </Pressable>
        <Text style={styles.migrationHint}>
          Je huidige totale voorraad blijft actief totdat je de voorraad per maat
          bevestigt.
        </Text>
      </View>
    );
  }

  if (showMigrationEditor || (product.usesVariants && !product.variantsReady)) {
    return (
      <View style={styles.root}>
        <Text style={styles.sectionTitle}>Voorraad per maat instellen</Text>
        <Text style={styles.warnText}>
          Je huidige totale voorraad wordt pas vervangen zodra je de voorraad per maat
          hebt ingesteld. Stel per maat je werkelijke aantallen in.
        </Text>
        <ProductVariantSizeEditor
          mainCategory={product.mainCategory as any}
          audience={(product.audience as import("../constants/shopCategories").ShopAudienceCode | null) ?? null}
          value={migrationMap}
          onChange={setMigrationMap}
        />
        <Pressable
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={() => void confirmMigrationDraft()}
          disabled={busy}
        >
          <Text style={styles.primaryBtnText}>Voorraad per maat activeren</Text>
        </Pressable>
      </View>
    );
  }

  if (!product.variantsReady) {
    return null;
  }

  return (
    <View style={styles.root}>
      <Text style={styles.sectionTitle}>Voorraad per maat</Text>
      {variants.map((variant) => (
        <View key={variant.id} style={styles.variantCard}>
          <View style={styles.variantHead}>
            <Text style={styles.variantSizeLabel}>Maat {variant.optionValue}</Text>
            <Text
              style={[
                styles.variantStockLabel,
                variant.stock <= 0 && styles.variantStockOut,
              ]}
            >
              {variant.stock > 0 ? `${variant.stock} beschikbaar` : "Uitverkocht"}
            </Text>
          </View>
          <Pressable
            style={styles.variantActionBtn}
            onPress={() =>
              openVariantModal(variant, variant.stock > 0 ? "set" : "add")
            }
            disabled={busy}
          >
            <Text style={styles.variantActionBtnText}>
              {variant.stock > 0 ? "Voorraad aanpassen" : "Voorraad toevoegen"}
            </Text>
          </Pressable>
        </View>
      ))}

      {history.length > 0 ? (
        <View style={styles.historyBlock}>
          <Text style={styles.historyTitle}>Recente wijzigingen</Text>
          {history.slice(0, 5).map((row) => (
            <Text key={row.id} style={styles.historyLine}>
              {formatStockHistoryLine(row)}
            </Text>
          ))}
        </View>
      ) : null}

      <Modal visible={modalMode != null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Maat {modalVariant?.optionValue ?? ""} aanpassen
            </Text>
            <Text style={styles.modalCurrent}>
              Huidige voorraad: {modalVariant?.stock ?? 0}
            </Text>

            <View style={styles.modalModeRow}>
              <Pressable
                style={[
                  styles.modalModeChip,
                  modalMode === "add" && styles.modalModeChipActive,
                ]}
                onPress={() => {
                  setModalMode("add");
                  setModalInput("");
                }}
              >
                <Text
                  style={[
                    styles.modalModeChipText,
                    modalMode === "add" && styles.modalModeChipTextActive,
                  ]}
                >
                  Toevoegen
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalModeChip,
                  modalMode === "set" && styles.modalModeChipActive,
                ]}
                onPress={() => {
                  setModalMode("set");
                  setModalInput(String(modalVariant?.stock ?? 0));
                }}
              >
                <Text
                  style={[
                    styles.modalModeChipText,
                    modalMode === "set" && styles.modalModeChipTextActive,
                  ]}
                >
                  Nieuw totaal
                </Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.modalInput}
              value={modalInput}
              onChangeText={setModalInput}
              keyboardType="number-pad"
              placeholder={modalMode === "add" ? "Aantal toevoegen" : "Nieuw totaal"}
              placeholderTextColor={theme.textMuted}
            />

            <View style={styles.modalActions}>
              <Pressable style={styles.modalBtn} onPress={closeModal}>
                <Text style={styles.modalBtnText}>Annuleren</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={() => void confirmVariantModal()}
                disabled={busy}
              >
                <Text style={styles.modalBtnPrimaryText}>Bevestigen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: { gap: 14, marginTop: 8 },
  loadingWrap: { paddingVertical: 16, alignItems: "center" },
  sectionTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  migrationCard: {
    gap: 12,
    padding: 18,
    borderRadius: 18,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginTop: 8,
  },
  migrationTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 17,
    lineHeight: 24,
  },
  migrationText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  migrationHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  warnText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: theme.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: {
    color: theme.bg,
    fontWeight: "800",
    fontSize: 15,
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostBtnText: {
    color: theme.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  btnDisabled: { opacity: 0.6 },
  variantCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    gap: 12,
  },
  variantHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  variantSizeLabel: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 17,
  },
  variantStockLabel: {
    color: theme.textMuted,
    fontWeight: "600",
    fontSize: 14,
  },
  variantStockOut: {
    color: theme.textMuted,
    fontStyle: "italic",
  },
  variantActionBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: theme.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorderMuted,
  },
  variantActionBtnText: {
    color: theme.accent,
    fontWeight: "800",
    fontSize: 14,
  },
  historyBlock: { gap: 6, marginTop: 4 },
  historyTitle: {
    color: theme.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  historyLine: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 18,
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
    gap: 12,
  },
  modalTitle: {
    color: theme.text,
    fontWeight: "800",
    fontSize: 18,
  },
  modalCurrent: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  modalModeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modalModeChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  modalModeChipActive: {
    backgroundColor: theme.accentSoft,
    borderColor: theme.accentBorderMuted,
  },
  modalModeChipText: {
    color: theme.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  modalModeChipTextActive: {
    color: theme.accent,
  },
  modalInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 4,
  },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  modalBtnText: { color: theme.textMuted, fontWeight: "700", fontSize: 15 },
  modalBtnPrimary: {
    backgroundColor: theme.accent,
  },
  modalBtnPrimaryText: { color: theme.bg, fontWeight: "800", fontSize: 15 },
  });
}
