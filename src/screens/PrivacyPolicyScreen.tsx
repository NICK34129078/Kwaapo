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
  LegalSection,
  LegalSummaryCard,
  LegalTableOfContents,
  PrivacyContactCard,
  PrivacyDataTable,
  PrivacyRightsCard,
} from "../components/legal";
import { LEGAL_PLACEHOLDERS } from "../constants/legalPlaceholders";
import type { PolicyId } from "../constants/appPolicies";
import {
  PRIVACY_CHAPTERS,
  PRIVACY_DEVELOPER_JURIST_NOTE,
  PRIVACY_RETENTION_ROWS,
  PRIVACY_SUMMARY_POINTS,
  getPrivacyTocItems,
} from "../constants/privacyPolicyContent";
import { spacing } from "../constants/theme";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";

const SECTION_TEST_IDS: Record<string, string> = {
  data: "privacy-section-data",
  purposes: "privacy-section-purposes",
  "legal-bases": "privacy-section-legal-bases",
  personalization: "privacy-section-ranking",
  retention: "privacy-section-retention",
  rights: "privacy-section-rights",
};

export function PrivacyPolicyScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const headerHeightRef = useRef(0);

  const [tocExpanded, setTocExpanded] = useState(width >= 390);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    PRIVACY_CHAPTERS[0]?.id ?? null
  );
  const [showFloatingTop, setShowFloatingTop] = useState(false);

  const tocItems = useMemo(() => getPrivacyTocItems(), []);

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
      setShowFloatingTop(offsetY > 480);

      const probe = offsetY + 120;
      let current = PRIVACY_CHAPTERS[0]?.id ?? null;
      for (const chapter of PRIVACY_CHAPTERS) {
        const sectionY = sectionOffsetsRef.current[chapter.id];
        if (typeof sectionY === "number" && sectionY <= probe) {
          current = chapter.id;
        }
      }
      setActiveSectionId(current);
    },
    []
  );

  const onContentLayout = useCallback((_e: LayoutChangeEvent) => {
    headerHeightRef.current = 0;
  }, []);

  const rightsActions = useMemo(
    () => [
      {
        label: "Mijn gegevens bekijken",
        onPress: () => navigation.navigate("MainTabs", { screen: "Profile" }),
        hint: "Profiel en instellingen in de app",
      },
      {
        label: "Mijn gegevens corrigeren",
        onPress: () => navigation.navigate("MainTabs", { screen: "Profile" }),
        hint: "Bewerk je profiel in de app",
      },
      {
        label: "Mijn gegevens downloaden",
        onPress: () => navigation.navigate("ContactSupport"),
        hint: "Dataportabiliteit via privacyverzoek bij support",
      },
      {
        label: "Account verwijderen",
        onPress: () => navigation.navigate("AccountDeletion"),
        testID: "privacy-delete-account-button",
      },
      {
        label: "Privacyverzoek indienen",
        onPress: () => openPolicy("contact"),
      },
    ],
    [navigation, openPolicy]
  );

  return (
    <View
      style={[styles.root, { paddingTop: insets.top }]}
      testID="privacy-policy-screen"
    >
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
          Privacybeleid
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
            title="Privacybeleid"
            subtitle="Hoe Kwaapo jouw persoonsgegevens gebruikt en beschermt"
            effectiveDate={LEGAL_PLACEHOLDERS.EFFECTIVE_DATE}
            version={LEGAL_PLACEHOLDERS.VERSION}
          />

          <LegalSummaryCard
            title="Privacy in het kort"
            items={PRIVACY_SUMMARY_POINTS}
          />

          <LegalTableOfContents
            items={tocItems}
            expanded={tocExpanded}
            activeId={activeSectionId}
            onToggleExpanded={() => setTocExpanded((v) => !v)}
            onSelect={scrollToSection}
            testID="privacy-policy-toc"
          />

          {PRIVACY_CHAPTERS.map((chapter) => (
            <React.Fragment key={chapter.id}>
              <LegalSection
                id={chapter.id}
                number={chapter.number}
                title={chapter.title}
                blocks={chapter.blocks}
                onLayout={onSectionLayout}
                onBackToTop={scrollToTop}
                testID={SECTION_TEST_IDS[chapter.id]}
              />
              {chapter.id === "retention" ? (
                <PrivacyDataTable rows={PRIVACY_RETENTION_ROWS} />
              ) : null}
              {chapter.id === "rights" ? (
                <PrivacyRightsCard actions={rightsActions} />
              ) : null}
            </React.Fragment>
          ))}

          <PrivacyContactCard
            onContact={() => navigation.navigate("ContactSupport")}
            onPrivacyRequest={() => openPolicy("contact")}
            onDeleteAccount={() => navigation.navigate("AccountDeletion")}
            onTerms={() => openPolicy("terms")}
            onCommunity={() => openPolicy("community")}
          />

          <View style={styles.juristNote}>
            <Text style={styles.juristTitle}>Let op voor publicatie</Text>
            <Text style={styles.juristBody}>{PRIVACY_DEVELOPER_JURIST_NOTE}</Text>
          </View>
        </View>
      </ScrollView>

      {showFloatingTop ? (
        <View
          style={[styles.floatingTop, { bottom: insets.bottom + spacing.md }]}
          pointerEvents="box-none"
        >
          <BackToTopButton onPress={scrollToTop} testID="privacy-back-to-top" />
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
      paddingTop: 4,
    },
    juristNote: {
      marginTop: spacing.md,
      marginBottom: spacing.xl,
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
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
      right: spacing.lg,
      left: spacing.lg,
      alignItems: "flex-end",
    },
  });
}
