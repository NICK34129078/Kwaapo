import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AvatarImage } from "../components/AvatarImage";
import {
  fetchMyBlockedUsers,
  unblockUser,
  type BlockedUserEntry,
} from "../services/feedModerationService";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

function formatHandle(username: string | null | undefined, fallback: string): string {
  const raw = username?.trim().replace(/^@+/, "") ?? "";
  return raw.length > 0 ? `@${raw}` : fallback;
}

function displayNameFor(entry: BlockedUserEntry, userFallback: string): string {
  const name = entry.displayName?.trim();
  if (name) {
    return name;
  }
  const user = entry.username?.trim();
  if (user) {
    return user.replace(/^@+/, "");
  }
  return userFallback;
}

function BlockedUserRow({
  entry,
  unblocking,
  onOpenProfile,
  onUnblockPress,
}: {
  entry: BlockedUserEntry;
  unblocking: boolean;
  onOpenProfile: (entry: BlockedUserEntry) => void;
  onUnblockPress: (entry: BlockedUserEntry) => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const userFallback = `@${t("common.user").toLowerCase()}`;

  const handle = formatHandle(entry.username, userFallback);
  const name = displayNameFor(entry, t("common.user"));

  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMainPressable}
        onPress={() => onOpenProfile(entry)}
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        <AvatarImage uri={entry.avatarUrl} style={styles.avatar} />
        <View style={styles.rowText}>
          <Text style={styles.displayName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            {handle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={[styles.unblockBtn, unblocking && styles.unblockBtnDisabled]}
        onPress={() => onUnblockPress(entry)}
        disabled={unblocking}
        accessibilityRole="button"
        accessibilityLabel={t("blockedUsers.unblock")}
      >
        {unblocking ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <Text style={styles.unblockBtnText}>{t("blockedUsers.unblock")}</Text>
        )}
      </Pressable>
    </View>
  );
}

export function BlockedUsersScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();

  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<BlockedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const list = await fetchMyBlockedUsers();
    setEntries(list);
    return list;
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load()
        .catch((e) => {
          const msg = getReadableErrorMessage(e, t("blockedUsers.loadFailed"));
          setError(msg);
          if (__DEV__) {
            console.log("[BlockedUsers] error initial_load", msg);
          }
        })
        .finally(() => setLoading(false));
    }, [load, t])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (e) {
      const msg = getReadableErrorMessage(e, t("blockedUsers.loadFailed"));
      setError(msg);
      if (__DEV__) {
        console.log("[BlockedUsers] error refresh", msg);
      }
    } finally {
      setRefreshing(false);
    }
  }, [load, t]);

  const onOpenProfile = useCallback(
    (entry: BlockedUserEntry) => {
      navigation.navigate("PublicProfile", { profileId: entry.blockedId });
    },
    [navigation]
  );

  const performUnblock = useCallback(
    async (entry: BlockedUserEntry) => {
      if (unblockingId) {
        return;
      }
      setUnblockingId(entry.blockedId);
      try {
        await unblockUser(entry.blockedId);
        setEntries((prev) =>
          prev.filter((row) => row.blockedId !== entry.blockedId)
        );
        if (__DEV__) {
          console.log(
            `[BlockedUsers] unblock succeeded ${entry.blockedId}`
          );
        }
      } catch (e) {
        const msg = getReadableErrorMessage(e, t("blockedUsers.unblockFailed"));
        Alert.alert(t("blockedUsers.unblockFailed"), msg);
        if (__DEV__) {
          console.log(
            `[BlockedUsers] unblock failed ${entry.blockedId} ${msg}`
          );
        }
      } finally {
        setUnblockingId(null);
      }
    },
    [unblockingId, t]
  );

  const onUnblockPress = useCallback(
    (entry: BlockedUserEntry) => {
      const handle = formatHandle(
        entry.username,
        `@${t("common.user").toLowerCase()}`
      );
      if (__DEV__) {
        console.log(`[BlockedUsers] unblock pressed ${entry.blockedId}`);
      }
      Alert.alert(
        t("blockedUsers.unblockTitle"),
        t("blockedUsers.unblockMessage", { handle }),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("blockedUsers.unblock"),
            onPress: () => {
              if (__DEV__) {
                console.log(
                  `[BlockedUsers] unblock confirmed ${entry.blockedId}`
                );
              }
              void performUnblock(entry);
            },
          },
        ]
      );
    },
    [performUnblock, t]
  );

  const renderEmpty = () => {
    if (loading) {
      return null;
    }
    if (error) {
      return (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true);
              void load()
                .catch((e) => {
                  setError(getReadableErrorMessage(e, t("blockedUsers.loadFailed")));
                })
                .finally(() => setLoading(false));
            }}
            accessibilityRole="button"
            accessibilityLabel={t("common.retry")}
          >
            <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>{t("blockedUsers.emptyTitle")}</Text>
        <Text style={styles.emptyBody}>{t("blockedUsers.emptyBody")}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.topTitle}>{t("blockedUsers.title")}</Text>
        <View style={styles.topBtn} />
      </View>

      <Text style={styles.subtitle}>{t("blockedUsers.subtitle")}</Text>

      {loading && entries.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.blockedId}
          renderItem={({ item }) => (
            <BlockedUserRow
              entry={item}
              unblocking={unblockingId === item.blockedId}
              onOpenProfile={onOpenProfile}
              onUnblockPress={onUnblockPress}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            entries.length === 0 && styles.listContentEmpty,
            { paddingBottom: insets.bottom + 24 },
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={theme.accent}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
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
      justifyContent: "space-between",
      paddingHorizontal: 8,
      paddingBottom: 4,
    },
    topBtn: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    topTitle: {
      flex: 1,
      textAlign: "center",
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    loadingWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    listContentEmpty: {
      flexGrow: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 10,
      borderRadius: 14,
      backgroundColor: theme.bgElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    rowMainPressable: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.accentFaint,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    displayName: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
    username: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: "500",
    },
    unblockBtn: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.accentBorder,
      backgroundColor: theme.accentFaint,
      alignItems: "center",
      justifyContent: "center",
    },
    unblockBtnDisabled: {
      opacity: 0.6,
    },
    unblockBtnText: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "600",
    },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
      paddingTop: 48,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
      marginBottom: 8,
    },
    emptyBody: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    errorText: {
      color: theme.danger,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: 16,
    },
    retryBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    retryBtnText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: "600",
    },
  });
}
