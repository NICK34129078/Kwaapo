import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
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
import {
  addProductStock,
  fetchProductStockHistory,
  setProductStock,
  type ProductStockAdjustment,
} from "../services/productStockService";
import {
  formatProductStockError,
} from "../utils/formatAppError";
import {
  formatStockHistoryLine,
  getProductStockStatus,
} from "../utils/productStock";

type Props = {
  productId: string;
  stock: number;
  onStockChanged: (nextStock: number) => void;
  onPendingChange?: (pending: boolean) => void;
  openAddOnMount?: boolean;
};

type StockModalMode = "add" | "set" | null;

export function ProductStockSection({
  productId,
  stock,
  onStockChanged,
  onPendingChange,
  openAddOnMount = false,
}: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [displayStock, setDisplayStock] = useState(stock);
  const [history, setHistory] = useState<ProductStockAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modalMode, setModalMode] = useState<StockModalMode>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    setDisplayStock(stock);
  }, [stock]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const rows = await fetchProductStockHistory(productId, 5);
      setHistory(rows);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, displayStock]);

  useEffect(() => {
    if (openAddOnMount) {
      setModalMode("add");
      setInputValue("");
    }
  }, [openAddOnMount]);

  const status = useMemo(
    () => getProductStockStatus(displayStock),
    [displayStock]
  );

  const openModal = useCallback((mode: StockModalMode) => {
    setModalMode(mode);
    setInputValue(mode === "set" ? String(displayStock) : "");
  }, [displayStock]);

  const closeModal = useCallback(() => {
    setModalMode(null);
    setInputValue("");
  }, []);

  useEffect(() => {
    onPendingChange?.(modalMode !== null);
  }, [modalMode, onPendingChange]);

  const onQuickDelta = useCallback(
    (delta: number) => {
      if (delta < 0 && displayStock <= 0) {
        return;
      }
      openModal("set");
      setInputValue(String(Math.max(0, displayStock + delta)));
    },
    [displayStock, openModal]
  );

  const onConfirmModal = useCallback(async () => {
    const parsed = parseInt(inputValue.replace(/\D/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      Alert.alert("Ongeldig aantal", "Vul een geldig getal in.");
      return;
    }

    setBusy(true);
    try {
      if (modalMode === "add") {
        if (parsed <= 0) {
          Alert.alert("Ongeldig aantal", "Voer een positief aantal in.");
          return;
        }
        const result = await addProductStock(productId, parsed);
        setDisplayStock(result.stockAfter);
        onStockChanged(result.stockAfter);
        closeModal();
        Alert.alert(
          "Voorraad bijgewerkt",
          `${parsed} stuks toegevoegd. Je voorraad is nu ${result.stockAfter}.`
        );
      } else if (modalMode === "set") {
        const result = await setProductStock(productId, parsed);
        setDisplayStock(result.stockAfter);
        onStockChanged(result.stockAfter);
        closeModal();
        Alert.alert(
          "Voorraad bijgewerkt",
          `Voorraad aangepast naar ${result.stockAfter}.`
        );
      }
      await loadHistory();
    } catch (e) {
      Alert.alert("Niet gelukt", formatProductStockError(e));
    } finally {
      setBusy(false);
    }
  }, [
    closeModal,
    inputValue,
    loadHistory,
    modalMode,
    onStockChanged,
    productId,
  ]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>VOORRAAD</Text>
      <Text style={styles.sectionHint}>
        Voorraad wordt direct opgeslagen via de knoppen hieronder. Opslaan
        bovenaan bewaart alleen productgegevens (naam, prijs, foto's, enz.).
      </Text>

      <View style={styles.counterRow}>
        <Pressable
          style={[styles.stepBtn, displayStock <= 0 && styles.stepBtnDisabled]}
          onPress={() => onQuickDelta(-1)}
          disabled={busy || displayStock <= 0}
          accessibilityRole="button"
          accessibilityLabel="Eén minder"
        >
          <Ionicons name="remove" size={28} color={theme.text} />
        </Pressable>

        <View style={styles.counterCenter}>
          <Text style={styles.counterValue}>{displayStock}</Text>
          <Text
            style={[
              styles.counterHint,
              status.tone === "out" && styles.counterHintOut,
              status.tone === "low" && styles.counterHintLow,
            ]}
          >
            {status.tone === "out"
              ? "Uitverkocht"
              : status.tone === "low"
                ? "Bijna uitverkocht"
                : `${displayStock} stuks beschikbaar`}
          </Text>
        </View>

        <Pressable
          style={styles.stepBtn}
          onPress={() => openModal("add")}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Eén meer toevoegen"
        >
          <Ionicons name="add" size={28} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => openModal("set")}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Voorraad aanpassen"
        >
          <Ionicons name="create-outline" size={18} color={theme.accent} />
          <Text style={styles.actionBtnText}>Voorraad aanpassen</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.actionBtnPrimary]}
          onPress={() => openModal("add")}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Voorraad toevoegen"
        >
          <Ionicons name="add-circle-outline" size={18} color={theme.bg} />
          <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
            Voorraad toevoegen
          </Text>
        </Pressable>
      </View>

      <View style={styles.historyBlock}>
        <Text style={styles.historyTitle}>Recente voorraadwijzigingen</Text>
        {historyLoading ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : history.length === 0 ? (
          <Text style={styles.historyEmpty}>Nog geen wijzigingen.</Text>
        ) : (
          history.map((row) => (
            <Text key={row.id} style={styles.historyLine}>
              {formatStockHistoryLine(row)}
            </Text>
          ))
        )}
      </View>

      <Modal
        visible={modalMode !== null}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {modalMode === "add" ? "Voorraad toevoegen" : "Voorraad aanpassen"}
            </Text>
            <Text style={styles.modalHint}>
              {modalMode === "add"
                ? `Huidige voorraad: ${displayStock}. Hoeveel wil je erbij zetten?`
                : `Huidige voorraad: ${displayStock}. Wat is het nieuwe totaal?`}
            </Text>
            <TextInput
              style={styles.modalInput}
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="number-pad"
              placeholder={modalMode === "add" ? "Bijv. 5" : "Bijv. 20"}
              placeholderTextColor={theme.textMuted}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancel}
                onPress={closeModal}
                disabled={busy}
              >
                <Text style={styles.modalCancelText}>Annuleren</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, busy && styles.modalConfirmDisabled]}
                onPress={() => void onConfirmModal()}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.modalConfirmText}>Bevestigen</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  section: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  sectionTitle: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  sectionHint: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  counterCenter: {
    minWidth: 120,
    alignItems: "center",
  },
  counterValue: {
    color: theme.text,
    fontSize: 44,
    fontWeight: "800",
    lineHeight: 50,
  },
  counterHint: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
  counterHintLow: {
    color: "#d4a017",
  },
  counterHintOut: {
    color: "#e07a5f",
  },
  actionRow: {
    gap: 10,
  },
  actionBtn: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  actionBtnPrimary: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  actionBtnText: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  actionBtnTextPrimary: {
    color: theme.bg,
  },
  historyBlock: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    gap: 6,
  },
  historyTitle: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  historyEmpty: {
    color: theme.textMuted,
    fontSize: 13,
  },
  historyLine: {
    color: theme.text,
    fontSize: 13,
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
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  modalTitle: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  modalHint: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.text,
    fontSize: 18,
    fontWeight: "700",
    backgroundColor: theme.bg,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancel: {
    minHeight: 44,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },
  modalConfirm: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmDisabled: {
    opacity: 0.6,
  },
  modalConfirmText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "800",
  },
});
}

