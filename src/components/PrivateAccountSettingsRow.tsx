import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  fetchMyProfileIsPrivate,
  updateMyProfileIsPrivate,
} from "../services/profilePrivacyService";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";
import { SettingsRowIcon } from "./SettingsRowIcon";

type Props = {
  /** Reload privacy state when settings sheet opens. */
  active?: boolean;
  onPrivacyChange?: (isPrivate: boolean) => void;
};

export function PrivateAccountSettingsRow({ active = true, onPrivacyChange }: Props) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const value = await fetchMyProfileIsPrivate();
      setIsPrivate(value);
      onPrivacyChange?.(value);
    } catch (e) {
      const msg = getReadableErrorMessage(e, t("privacy.loadFailed"));
      Alert.alert(t("alerts.error"), msg);
    } finally {
      setLoading(false);
    }
  }, [onPrivacyChange, t]);

  useEffect(() => {
    if (active) {
      void load();
    }
  }, [active, load]);

  const onToggle = useCallback(
    async (next: boolean) => {
      if (saving || loading) {
        return;
      }
      const previous = isPrivate;
      setIsPrivate(next);
      onPrivacyChange?.(next);
      setSaving(true);
      try {
        await updateMyProfileIsPrivate(next);
      } catch (e) {
        setIsPrivate(previous);
        onPrivacyChange?.(previous);
        const msg = getReadableErrorMessage(e, t("privacy.saveFailed"));
        Alert.alert(t("alerts.error"), msg);
      } finally {
        setSaving(false);
      }
    },
    [isPrivate, loading, onPrivacyChange, saving, t]
  );

  return (
    <View style={styles.row}>
      <SettingsRowIcon name="lock-closed-outline" />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{t("privacy.privateAccountLabel")}</Text>
        {loading ? (
          <View style={styles.loadingLine}>
            <ActivityIndicator size="small" color={theme.accent} />
          </View>
        ) : (
          <Text style={styles.description}>
            {isPrivate
              ? t("privacy.privateDescription")
              : t("privacy.publicDescription")}
          </Text>
        )}
      </View>
      <View style={styles.switchWrap}>
        {saving ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Switch
            value={isPrivate}
            onValueChange={(value) => void onToggle(value)}
            disabled={loading || saving}
            trackColor={{
              false: theme.border,
              true: theme.accent,
            }}
            thumbColor="#FFFFFF"
            ios_backgroundColor={theme.border}
            accessibilityLabel={t("privacy.privateAccountLabel")}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
      gap: 4,
      paddingRight: 4,
    },
    title: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "600",
    },
    description: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    loadingLine: {
      paddingTop: 4,
      alignItems: "flex-start",
    },
    switchWrap: {
      minWidth: 52,
      alignItems: "flex-end",
      justifyContent: "center",
      paddingTop: 2,
    },
  });
}
