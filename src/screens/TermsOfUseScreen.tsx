import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BackToTopButton,
  LegalHeader,
  LegalLinkButton,
  LegalSection,
  LegalSummaryCard,
  LegalTableOfContents,
} from "../components/legal";
import { LEGAL_PLACEHOLDERS } from "../constants/legalPlaceholders";
import {
  TERMS_CHAPTERS,
  TERMS_DEVELOPER_JURIST_NOTE,
  TERMS_SUMMARY_POINTS,
  TERMS_YOUTH_SUMMARY,
  getTermsTocItems,
} from "../constants/termsOfUseContent";
import type { PolicyId } from "../constants/appPolicies";
import { spacing } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

const SECTION_TEST_IDS: Record<string, string> = {
  age: "terms-section-age",
  content: "terms-section-content",
  marketplace: "terms-section-marketplace",
  liability: "terms-section-liability",
};

export function TermsOfUseScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const contentOffsetYRef = useRef(0);
  const headerHeightRef = useRef(0);

  const [tocExpanded, setTocExpanded] = useState(width >= 390);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    TERMS_CHAPTERS[0]?.id ?? null
  );
  const [showFloatingTop, setShowFloatingTop] = useState(false);

  const tocItems = useMemo(() => getTermsTocItems(), []);

  const openPolicy = useCallback(
    (policyId: PolicyId) => {
      navigation.navigate("PolicyDocument", { policyId });
    },
    [navigation]
  );

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const scrollToSection = useCallback((sectionId: string) => {
    const y = sectionOffsetsRef.current[sectionId];
    if (typeof y !== "number") {
      return;
    }
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - 12),
      animated: true,
    });
    setActiveSectionId(sectionId);
  }, []);

  const onSectionLayout = useCallback((id: string, y: number) => {
    sectionOffsetsRef.current[id] = y + headerHeightRef.current;
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      contentOffsetYRef.current = offsetY;
      setShowFloatingTop(offsetY > 480);

      const probe = offsetY + 120;
      let current = TERMS_CHAPTERS[0]?.id ?? null;
      for (const chapter of TERMS_CHAPTERS) {
        const sectionY = sectionOffsetsRef.current[chapter.id];
        if (typeof sectionY === "number" && sectionY <= probe) {
          current = chapter.id;
        }
      }
      setActiveSectionId(current);
    },
    []
  );

  const onContentLayout = useCallback((e: LayoutChangeEvent) => {
    headerHeightRef.current = 0;
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="terms-screen">
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
          Gebruikersvoorwaarden
        </Text>
        <View style={styles.topBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 96 },
        ]}
      >
        <View onLayout={onContentLayout}>
          <LegalHeader
            title="Gebruikersvoorwaarden"
            subtitle="De afspraken die gelden wanneer je Kwaapo gebruikt"
            effectiveDate={LEGAL_PLACEHOLDERS.EFFECTIVE_DATE}
            version={LEGAL_PLACEHOLDERS.VERSION}
          />

          <LegalSummaryCard items={TERMS_SUMMARY_POINTS} />

          <LegalTableOfContents
            items={tocItems}
            expanded={tocExpanded}
            activeId={activeSectionId}
            onToggleExpanded={() => setTocExpanded((v) => !v)}
            onSelect={scrollToSection}
          />

          {TERMS_CHAPTERS.map((chapter) => (
            <LegalSection
              key={chapter.id}
              id={chapter.id}
              number={chapter.number}
              title={chapter.title}
              blocks={chapter.blocks}
              onLayout={onSectionLayout}
              onBackToTop={scrollToTop}
              testID={SECTION_TEST_IDS[chapter.id]}
            />
          ))}

          <View style={styles.youthCard}>
            <Text style={styles.youthTitle}>{TERMS_YOUTH_SUMMARY.title}</Text>
            {TERMS_YOUTH_SUMMARY.items.map((item) => (
              <Text key={item} style={styles.youthItem}>
                • {item}
              </Text>
            ))}
            <Text style={styles.youthDisclaimer}>
              {TERMS_YOUTH_SUMMARY.disclaimer}
            </Text>
          </View>

          <View style={styles.actions}>
            <Text style={styles.actionsTitle}>Gerelateerde documenten</Text>
            <LegalLinkButton
              label="Neem contact op"
              onPress={() => navigation.navigate("ContactSupport")}
              testID="terms-contact-button"
            />
            <LegalLinkButton
              label="Meld illegale content"
              onPress={() => navigation.navigate("ContactSupport")}
            />
            <LegalLinkButton
              label="Bekijk communityrichtlijnen"
              onPress={() => openPolicy("community")}
            />
            <LegalLinkButton
              label="Bekijk privacybeleid"
              onPress={() => openPolicy("privacy")}
            />
            <LegalLinkButton
              label="Marketplace-voorwaarden"
              onPress={() => openPolicy("marketplace")}
            />
            <LegalLinkButton
              label="Seller-voorwaarden"
              onPress={() => openPolicy("seller")}
            />
            <LegalLinkButton
              label="Retour & disputes"
              onPress={() => openPolicy("refunds")}
            />
          </View>

          <View style={styles.juristNote}>
            <Text style={styles.juristTitle}>Let op voor publicatie</Text>
            <Text style={styles.juristBody}>{TERMS_DEVELOPER_JURIST_NOTE}</Text>
          </View>
        </View>
      </ScrollView>

      {showFloatingTop ? (
        <View
          style={[styles.floatingTop, { bottom: insets.bottom + spacing.md }]}
          pointerEvents="box-none"
        >
          <BackToTopButton onPress={scrollToTop} />
        </View>
      ) : null}
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
    youthCard: {
      backgroundColor: theme.bgElevated,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: spacing.md,
      marginBottom: spacing.xl,
      gap: spacing.sm,
    },
    youthTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    youthItem: {
      color: theme.textMuted,
      fontSize: 16,
      lineHeight: 24,
    },
    youthDisclaimer: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      fontStyle: "italic",
      marginTop: spacing.sm,
    },
    actions: {
      marginBottom: spacing.xl,
      gap: spacing.xs,
    },
    actionsTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "700",
      marginBottom: spacing.sm,
    },
    juristNote: {
      backgroundColor: theme.bgElevated,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    juristTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    juristBody: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    floatingTop: {
      position: "absolute",
      right: spacing.md,
      alignItems: "flex-end",
    },
  });
}

/**
 * DEVELOPER NOTE — Gebruikersvoorwaarden
 * Deze tekst is een werkversie voor productieontwikkeling.
 * Laat de definitieve voorwaarden vóór publicatie controleren door een Nederlandse jurist
 * (consumentenrecht, marketplace, AVG, DSA, intellectuele eigendom en betaalstromen).
 */
