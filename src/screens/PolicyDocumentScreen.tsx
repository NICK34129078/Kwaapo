import React from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  APP_POLICIES,
  getPolicyById,
  LEGAL_DISCLAIMER,
  type PolicyId,
} from "../constants/appPolicies";
import { SELLER_TERMS_SECTIONS } from "../constants/sellerTerms";

type RouteParams = {
  policyId: PolicyId;
};

export function PolicyDocumentScreen() {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const policyId = (route.params?.policyId ?? "privacy") as PolicyId;
  const policy = getPolicyById(policyId);

  const sections =
    policyId === "seller"
      ? SELLER_TERMS_SECTIONS.map((s) => ({ title: s.title, body: s.body }))
      : policy.sections;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Terug"
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.screenTitle} numberOfLines={1}>
          {policy.title}
        </Text>
        <View style={styles.topBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.version}>Versie {policy.version}</Text>
        <Text style={styles.disclaimer}>{LEGAL_DISCLAIMER}</Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 48,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    textAlign: "center",
    color: theme.text,
    fontSize: 17,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  version: {
    color: theme.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  disclaimer: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
    fontStyle: "italic",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  sectionBody: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
});
}


export { APP_POLICIES };
