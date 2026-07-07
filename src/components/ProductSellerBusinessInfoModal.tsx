import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatPublicBusinessLocation,
  getPublicSellerBusinessName,
} from "../services/sellerOnboardingService";
import type { ProductSeller } from "../services/productsService";

type Props = {
  visible: boolean;
  seller: ProductSeller | null;
  verifiedBusiness: boolean;
  onClose: () => void;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProductSellerBusinessInfoModal({
  visible,
  seller,
  verifiedBusiness,
  onClose,
}: Props) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const insets = useSafeAreaInsets();

  if (!seller || !verifiedBusiness) {
    return null;
  }

  const businessName = getPublicSellerBusinessName(seller, true);
  const location = formatPublicBusinessLocation(seller);
  const kvk = seller.kvkNumber?.trim() ?? "";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Sluiten" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Bedrijfsinformatie</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Sluiten"
            >
              <Ionicons name="close" size={24} color={theme.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
          >
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={14} color={theme.accent} />
              <Text style={styles.verifiedBadgeText}>
                Geverifieerde zakelijke verkoper
              </Text>
            </View>

            <InfoRow label="Bedrijfsnaam" value={businessName} />
            {kvk ? <InfoRow label="KVK-nummer" value={kvk} /> : null}
            {location ? <InfoRow label="Vestigingsplaats" value={location} /> : null}

            <Text style={styles.disclaimer}>
              Deze verkoper heeft bedrijfsgegevens ingevuld en uitbetalingen worden
              verwerkt via Stripe.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: {
    color: theme.text,
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    paddingBottom: 8,
    gap: 16,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.accentLight,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.accentBorder,
  },
  verifiedBadgeText: {
    color: theme.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  infoValue: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  disclaimer: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
});
}

