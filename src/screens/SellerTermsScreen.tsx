import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppTheme } from "../constants/themeTokens";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import {
  CURRENT_SELLER_TERMS_VERSION,
  SELLER_TERMS_ACCEPT_LABEL,
  SELLER_TERMS_SECTIONS,
} from "../constants/sellerTerms";
import { acceptCurrentSellerTerms } from "../services/sellerTermsService";

export function SellerTermsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const requireAcceptance = route.params?.requireAcceptance === true;
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAccept = useCallback(async () => {
    if (!accepted) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await acceptCurrentSellerTerms();
      if (requireAcceptance) {
        navigation.goBack();
      } else {
        navigation.goBack();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Acceptatie mislukt.");
    } finally {
      setBusy(false);
    }
  }, [accepted, navigation, requireAcceptance]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle}>Seller-voorwaarden</Text>
        <View style={styles.topBarSide} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.version}>Versie {CURRENT_SELLER_TERMS_VERSION}</Text>
        <Text style={styles.legalNote}>
          Operationele seller-verplichting en platform-uitleg. TODO: juridische review
          vóór publieke release.
        </Text>

        {SELLER_TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <Pressable
          style={styles.acceptRow}
          onPress={() => setAccepted((prev) => !prev)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <View style={[styles.box, accepted && styles.boxChecked]}>
            {accepted ? (
              <Ionicons name="checkmark" size={16} color={theme.bg} />
            ) : null}
          </View>
          <Text style={styles.acceptLabel}>{SELLER_TERMS_ACCEPT_LABEL}</Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryBtn, (!accepted || busy) && styles.primaryBtnDisabled]}
          onPress={() => void onAccept()}
          disabled={!accepted || busy}
          accessibilityRole="button"
          accessibilityLabel="Accepteer seller-voorwaarden"
        >
          {busy ? (
            <ActivityIndicator size="small" color={theme.bg} />
          ) : (
            <Text style={styles.primaryBtnText}>
              {requireAcceptance ? "Akkoord en doorgaan" : "Acceptatie opslaan"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarSide: { width: 40 },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  version: {
    color: theme.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  legalNote: {
    color: theme.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 16,
    fontStyle: "italic",
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  sectionBody: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  acceptRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
    marginBottom: 16,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: theme.accent,
    borderColor: theme.accent,
  },
  acceptLabel: {
    flex: 1,
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 13,
    marginBottom: 10,
  },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    color: theme.bg,
    fontSize: 15,
    fontWeight: "900",
  },
  });
}
