import React, { useCallback, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FeedPost } from "../data/placeholder";
import { resolvePostUsername } from "../services/sharePostService";

type SheetAction = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
  accent?: boolean;
  disabled?: boolean;
};

type Props = {
  visible: boolean;
  post: FeedPost;
  isOwnPost: boolean;
  isFollowing: boolean;
  followBusy?: boolean;
  deleteBusy?: boolean;
  onClose: () => void;
  onCopyLink: () => void;
  onViewProfile?: () => void;
  onToggleFollow?: () => void;
  onViewStats?: () => void;
  onDelete?: () => void;
  onNotInterested?: () => void;
  onReport?: () => void;
  onBlock?: () => void;
};

function MoreActionRow({
  action,
  onPress,
}: {
  action: SheetAction;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const labelColor = action.destructive
    ? "#FF6B6B"
    : action.accent
      ? theme.accent
      : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={action.disabled}
      style={({ pressed }) => [
        styles.row,
        pressed && !action.disabled && styles.rowPressed,
        action.disabled && styles.rowDisabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: action.disabled }}
    >
      <Ionicons name={action.icon} size={22} color={labelColor} />
      <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={2}>
        {action.label}
      </Text>
    </Pressable>
  );
}

export function PostMoreSheet({
  visible,
  post,
  isOwnPost,
  isFollowing,
  followBusy = false,
  deleteBusy = false,
  onClose,
  onCopyLink,
  onViewProfile,
  onToggleFollow,
  onViewStats,
  onDelete,
  onNotInterested,
  onReport,
  onBlock,
}: Props) {
  const styles = useThemedStyles(createStyles);

  const insets = useSafeAreaInsets();
  const handle = resolvePostUsername(post);

  const fireHaptic = useCallback(() => {
    if (Platform.OS === "web") {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const runAction = useCallback(
    (action: () => void) => {
      fireHaptic();
      onClose();
      action();
    },
    [fireHaptic, onClose]
  );

  const actions = useMemo((): SheetAction[] => {
    if (isOwnPost) {
      return [
        {
          id: "stats",
          label: "Statistieken",
          icon: "stats-chart-outline",
          onPress: () => onViewStats?.(),
          accent: true,
          disabled: !onViewStats,
        },
        {
          id: "copy",
          label: "Link kopiëren",
          icon: "link-outline",
          onPress: onCopyLink,
        },
        {
          id: "delete",
          label: "Verwijderen",
          icon: "trash-outline",
          onPress: () => onDelete?.(),
          destructive: true,
          disabled: deleteBusy || !onDelete,
        },
      ];
    }

    const followLabel = isFollowing ? `Ontvolgen @${handle}` : `Volgen @${handle}`;

    return [
      {
        id: "not-interested",
        label: "Niet geïnteresseerd",
        icon: "eye-off-outline",
        onPress: () => onNotInterested?.(),
        disabled: !onNotInterested,
      },
      {
        id: "follow",
        label: followLabel,
        icon: isFollowing ? "person-remove-outline" : "person-add-outline",
        onPress: () => onToggleFollow?.(),
        accent: !isFollowing,
        disabled: followBusy || !onToggleFollow,
      },
      {
        id: "copy",
        label: "Link kopiëren",
        icon: "link-outline",
        onPress: onCopyLink,
      },
      {
        id: "profile",
        label: "Bekijk profiel",
        icon: "person-circle-outline",
        onPress: () => onViewProfile?.(),
        disabled: !onViewProfile,
      },
      {
        id: "report",
        label: "Melden",
        icon: "flag-outline",
        onPress: () => onReport?.(),
        destructive: true,
        disabled: !onReport,
      },
      {
        id: "block",
        label: `Blokkeer @${handle}`,
        icon: "ban-outline",
        onPress: () => onBlock?.(),
        destructive: true,
        disabled: !onBlock,
      },
    ];
  }, [
    deleteBusy,
    followBusy,
    handle,
    isFollowing,
    isOwnPost,
    onBlock,
    onCopyLink,
    onDelete,
    onNotInterested,
    onReport,
    onToggleFollow,
    onViewProfile,
    onViewStats,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Sluit menu"
        />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Meer opties</Text>
          {actions.map((action, index) => (
            <View key={action.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <MoreActionRow
                action={action}
                onPress={() => {
                  if (action.disabled) {
                    return;
                  }
                  runAction(action.onPress);
                }}
              />
            </View>
          ))}
          <View style={styles.cancelGap} />
          <Pressable
            onPress={() => {
              fireHaptic();
              onClose();
            }}
            style={({ pressed }) => [
              styles.cancelBtn,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Annuleren"
          >
            <Text style={styles.cancelLabel}>Annuleren</Text>
          </Pressable>
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
    backgroundColor: theme.overlay,
  },
  sheet: {
    backgroundColor: theme.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 12,
  },
  sheetTitle: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  rowPressed: {
    backgroundColor: theme.accentFaint,
  },
  rowDisabled: {
    opacity: 0.45,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
    marginHorizontal: 8,
  },
  cancelGap: {
    height: 8,
  },
  cancelBtn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    marginBottom: 4,
  },
  cancelLabel: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
}

