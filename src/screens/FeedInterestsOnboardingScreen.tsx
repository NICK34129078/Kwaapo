import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { useGlobalFeed } from "../context/GlobalFeedContext";
import {
  fetchPopularFeedTags,
  seedFeedInterests,
} from "../services/feedInterestsService";
import {
  MAX_INTEREST_SELECTION,
  MIN_INTEREST_SELECTION,
  buildInterestOptions,
  canSubmitInterestSelection,
} from "../utils/feedInterests";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

export function FeedInterestsOnboardingScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { refreshGlobalFeed } = useGlobalFeed();

  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const popular = await fetchPopularFeedTags(40);
      if (!active) {
        return;
      }
      setOptions(buildInterestOptions(popular.map((p) => p.tag)));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const selectedCount = selected.size;
  const canSubmit = canSubmitInterestSelection(selectedCount);

  const toggle = useCallback((tag: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else if (next.size < MAX_INTEREST_SELECTION) {
        next.add(tag);
      }
      return next;
    });
  }, []);

  const finish = useCallback(
    async (tags: string[]) => {
      if (submitting) {
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await seedFeedInterests(tags);
        // Nieuwe voorkeuren → herlaad de personalized-feed meteen.
        await refreshGlobalFeed({ force: true });
        navigation.goBack();
      } catch (e) {
        setError(getReadableErrorMessage(e, t("feedInterests.saveFailed")));
        setSubmitting(false);
      }
    },
    [submitting, refreshGlobalFeed, navigation, t]
  );

  const onSubmit = useCallback(() => {
    void finish([...selected]);
  }, [finish, selected]);

  const onSkip = useCallback(() => {
    // Overslaan seedt niets maar zet wél de vlag, zodat de picker wegblijft.
    void finish([]);
  }, [finish]);

  const chips = useMemo(
    () =>
      options.map((tag) => {
        const active = selected.has(tag);
        return (
          <Pressable
            key={tag}
            onPress={() => toggle(tag)}
            disabled={submitting}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`#${tag}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              #{tag}
            </Text>
          </Pressable>
        );
      }),
    [options, selected, submitting, styles, toggle]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("feedInterests.title")}</Text>
        <Pressable
          onPress={onSkip}
          disabled={submitting}
          hitSlop={10}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel={t("feedInterests.skip")}
        >
          <Text style={styles.skipText}>{t("feedInterests.skip")}</Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        {t("feedInterests.subtitle", { min: MIN_INTEREST_SELECTION })}
      </Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.chipWrap,
            { paddingBottom: insets.bottom + 120 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {chips}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          style={[
            styles.submitBtn,
            (!canSubmit || submitting) && styles.submitBtnDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("feedInterests.submit")}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={theme.accentText} />
          ) : (
            <>
              <Ionicons
                name="sparkles"
                size={18}
                color={theme.accentText}
                style={styles.submitIcon}
              />
              <Text style={styles.submitText}>
                {canSubmit
                  ? t("feedInterests.submit")
                  : t("feedInterests.submitCount", {
                      count: selectedCount,
                      min: MIN_INTEREST_SELECTION,
                    })}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.bg,
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    title: {
      flex: 1,
      color: theme.text,
      fontSize: 26,
      fontWeight: "800",
    },
    skipBtn: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    skipText: {
      color: theme.textMuted,
      fontSize: 15,
      fontWeight: "600",
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 8,
      marginBottom: 18,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    chipActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent,
    },
    chipText: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "600",
    },
    chipTextActive: {
      color: theme.accentText,
    },
    footer: {
      position: "absolute",
      left: 20,
      right: 20,
      bottom: 0,
      backgroundColor: theme.bg,
      paddingTop: 12,
    },
    errorText: {
      color: theme.danger,
      fontSize: 14,
      textAlign: "center",
      marginBottom: 10,
    },
    submitBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 54,
      borderRadius: 16,
      backgroundColor: theme.accent,
    },
    submitBtnDisabled: {
      opacity: 0.5,
    },
    submitIcon: {
      marginRight: 8,
    },
    submitText: {
      color: theme.accentText,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
