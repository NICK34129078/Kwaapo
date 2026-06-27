import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../constants/theme";
import type { Product } from "../types/product";
import { formatPriceEur } from "../utils/formatPrice";

type Props = {
  visible: boolean;
  bottomInset: number;
  products: Product[];
  loading: boolean;
  loadError: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  selectedProductId: string | null;
  onSelect: (product: Product) => void;
  onClose: () => void;
};

export function UploadProductPickerPanel({
  visible,
  bottomInset,
  products,
  loading,
  loadError,
  query,
  onQueryChange,
  selectedProductId,
  onSelect,
  onClose,
}: Props) {
  if (!visible) {
    return null;
  }

  const showSearch = products.length > 1;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Sluit productkiezer"
      />
      <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Kies een product</Text>
            <Text style={styles.subtitle}>
              Alleen je gepubliceerde producten met voorraad
            </Text>
          </View>
          <Pressable
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Sluit productkiezer"
          >
            <Ionicons name="close" size={22} color={theme.text} />
          </Pressable>
        </View>

        {showSearch ? (
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={onQueryChange}
            placeholder="Zoek in jouw producten"
            placeholderTextColor={theme.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
          />
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={styles.hint}>Producten laden…</Text>
          </View>
        ) : loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>
              Producten laden is mislukt. Probeer het opnieuw.
            </Text>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const selected = selectedProductId === item.id;
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => onSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.name}
                >
                  {item.images[0] ? (
                    <Image source={{ uri: item.images[0] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbFallback]}>
                      <Ionicons name="image-outline" size={20} color={theme.textMuted} />
                    </View>
                  )}
                  <View style={styles.textWrap}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {formatPriceEur(item.price)} · Voorraad {item.stock}
                      {item.usesVariants ? " · Maten" : ""}
                    </Text>
                  </View>
                  {selected ? (
                    <View style={styles.selectedBadge}>
                      <Ionicons name="checkmark" size={18} color={theme.bg} />
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>Je hebt nog geen producten in je shop.</Text>
                <Text style={styles.emptyBody}>
                  Voeg eerst een product toe om het aan je video te koppelen.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
  },
  search: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.text,
    marginBottom: 12,
    backgroundColor: theme.bg,
  },
  list: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: theme.bg,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
    gap: 8,
  },
  hint: {
    color: theme.textMuted,
    fontSize: 13,
  },
  errorText: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: theme.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
});
