import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
import { AvatarImage } from "../components/AvatarImage";
import { ActivitySectionTabs } from "../components/ActivitySectionTabs";
import { SellerActionRequiredCard } from "../components/SellerActionRequiredCard";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { useNotificationCenter } from "../context/NotificationCenterContext";
import { useSellerFulfillment } from "../context/SellerFulfillmentContext";
import {
  acceptFollowRequest,
  declineFollowRequest,
  subscribeFollowRequestInserts,
  subscribeOutgoingFollowRequestAccepted,
} from "../services/followRequestService";
import {
  fetchSocialActivityFeed,
} from "../services/activityFeedService";
import { fetchActivityReadKeys } from "../services/activityReadService";
import {
  fetchOrderNotificationFeed,
  type OrderNotificationItem,
} from "../services/orderNotificationFeedService";
import type { ActivityFeedItem, ActivitySection } from "../types/activity";
import { getReadableErrorMessage } from "../utils/getReadableErrorMessage";

export type { ActivityFeedItem } from "../types/activity";

function truncateCommentPreview(body: string, maxLen = 80): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen).trimEnd()}…`;
}

function formatRelativeTimeNl(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) {
    return "net";
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min} min`;
  }
  const hours = Math.floor(min / 60);
  if (hours < 24) {
    return `${hours} u`;
  }
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

async function applySocialTabViewed(
  social: ActivityFeedItem[],
  markAll: (keys: string[]) => Promise<void>
): Promise<ActivityFeedItem[]> {
  const unreadKeys = social.filter((item) => item.isUnread).map((item) => item.activityKey);
  if (unreadKeys.length === 0) {
    return social;
  }
  await markAll(unreadKeys);
  return social.map((item) => ({ ...item, isUnread: false }));
}

export function ActivityScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();
  const { actionCount } = useSellerFulfillment();
  const {
    activityUnreadCount,
    ordersUnreadCount,
    isBusinessSeller,
    refresh: refreshCounts,
    markAllSocialActivityAsRead,
    markOrderNotificationRead,
  } = useNotificationCenter();

  const [activeSection, setActiveSection] = useState<ActivitySection>("activity");
  const activeSectionRef = useRef<ActivitySection>("activity");
  const markingSocialRef = useRef(false);
  const [socialItems, setSocialItems] = useState<ActivityFeedItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderNotificationItem[]>([]);
  const [loading, setLoading] = useState(() => !!user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestBusy, setRequestBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const load = useCallback(
    async (options?: { section?: ActivitySection; markSocialViewed?: boolean }) => {
      if (!user?.id) {
        setSocialItems([]);
        setOrderItems([]);
        setLoading(false);
        setError(null);
        return;
      }

      const section = options?.section ?? activeSectionRef.current;
      const shouldMarkSocialViewed =
        options?.markSocialViewed ?? section === "activity";

      setError(null);
      try {
        const readKeys = await fetchActivityReadKeys();
        let social = await fetchSocialActivityFeed(user.id, readKeys);
        const orders = isBusinessSeller
          ? await fetchOrderNotificationFeed()
          : [];

        if (shouldMarkSocialViewed && !markingSocialRef.current) {
          const hasUnread = social.some((item) => item.isUnread);
          if (hasUnread) {
            markingSocialRef.current = true;
            try {
              social = await applySocialTabViewed(social, markAllSocialActivityAsRead);
            } finally {
              markingSocialRef.current = false;
            }
          }
        }

        setSocialItems(social);
        setOrderItems(orders);
        await refreshCounts();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t("activityCenter.loadFailed");
        setError(msg);
        setSocialItems([]);
        setOrderItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isBusinessSeller, markAllSocialActivityAsRead, refreshCounts, t, user?.id]
  );

  const handleSectionChange = useCallback(
    (section: ActivitySection) => {
      setActiveSection(section);
      activeSectionRef.current = section;
      if (section === "activity" && user?.id) {
        void load({ section: "activity", markSocialViewed: true });
      }
    },
    [load, user?.id]
  );

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load();
  }, [load, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        void load({
          section: activeSectionRef.current,
          markSocialViewed: activeSectionRef.current === "activity",
        });
      }
    }, [load, user?.id])
  );

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const unsubIncoming = subscribeFollowRequestInserts(user.id, () => {
      void load();
    });
    const unsubAccepted = subscribeOutgoingFollowRequestAccepted(user.id, () => {
      void load();
    });
    return () => {
      unsubIncoming();
      unsubAccepted();
    };
  }, [load, user?.id]);

  const onRefresh = useCallback(() => {
    if (!user?.id) {
      return;
    }
    setRefreshing(true);
    void load({
      section: activeSectionRef.current,
      markSocialViewed: activeSectionRef.current === "activity",
    });
  }, [load, user?.id]);

  const handleSocialPress = useCallback(
    (item: ActivityFeedItem) => {
      navigation.navigate("PublicProfile", { profileId: item.actorId });
    },
    [navigation]
  );

  const handleAcceptFollowRequest = useCallback(
    async (item: ActivityFeedItem) => {
      const requestId = item.followRequestId;
      if (!requestId) {
        return;
      }
      setRequestBusy((prev) => ({ ...prev, [requestId]: true }));
      try {
        const ok = await acceptFollowRequest(requestId);
        if (ok) {
          setSocialItems((prev) =>
            prev.filter((row) => row.followRequestId !== requestId)
          );
          void refreshCounts();
        }
      } catch (e) {
        setError(getReadableErrorMessage(e, t("followRequest.error")));
      } finally {
        setRequestBusy((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
      }
    },
    [refreshCounts, t]
  );

  const handleDeclineFollowRequest = useCallback(
    async (item: ActivityFeedItem) => {
      const requestId = item.followRequestId;
      if (!requestId) {
        return;
      }
      setRequestBusy((prev) => ({ ...prev, [requestId]: true }));
      try {
        const ok = await declineFollowRequest(requestId);
        if (ok) {
          setSocialItems((prev) =>
            prev.filter((row) => row.followRequestId !== requestId)
          );
          void refreshCounts();
        }
      } catch (e) {
        setError(getReadableErrorMessage(e, t("followRequest.error")));
      } finally {
        setRequestBusy((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
      }
    },
    [refreshCounts, t]
  );

  const handleOrderPress = useCallback(
    (item: OrderNotificationItem) => {
      if (item.isUnread) {
        void markOrderNotificationRead(item.notification.id);
        setOrderItems((prev) =>
          prev.map((row) =>
            row.notification.id === item.notification.id
              ? { ...row, isUnread: false }
              : row
          )
        );
      }
      navigation.navigate("OrderDetail", { orderId: item.notification.orderId });
    },
    [markOrderNotificationRead, navigation]
  );

  const renderSocialItem = useCallback(
    ({ item }: { item: ActivityFeedItem }) => {
      const uname = item.profile.username?.trim() || "gebruiker";
      const display = item.profile.display_name?.trim();
      const timeLabel = formatRelativeTimeNl(item.created_at);
      const handle = uname.startsWith("@") ? uname : `@${uname}`;
      const actionLabel =
        item.kind === "follow_request"
          ? t("followRequest.wantsToFollow", { handle })
          : item.kind === "follow_request_accepted"
            ? t("followRequest.acceptedBy", { username: uname })
            : item.kind === "follow"
              ? t("activityCenter.followedYou")
              : item.kind === "like"
                ? t("activityCenter.likedPost")
                : t("activityCenter.commentedPost");
      const commentPreview =
        item.kind === "comment" && item.commentBody
          ? `“${truncateCommentPreview(item.commentBody)}”`
          : null;
      const requestId = item.followRequestId;
      const isRequestBusy = requestId ? !!requestBusy[requestId] : false;

      if (item.kind === "follow_request" && requestId) {
        return (
          <View style={[styles.row, item.isUnread && styles.rowUnread]}>
            <Pressable
              style={styles.followRequestMain}
              onPress={() => handleSocialPress(item)}
              accessibilityRole="button"
            >
              <AvatarImage uri={item.profile.avatar_url} style={styles.avatar} />
              <View style={styles.rowMain}>
                {display ? (
                  <Text style={styles.displayNamePrimary} numberOfLines={1}>
                    {display}
                  </Text>
                ) : null}
                <Text style={styles.usernameMuted} numberOfLines={1}>
                  {handle}
                </Text>
                <Text style={styles.action}>{actionLabel}</Text>
                {timeLabel ? <Text style={styles.timeInline}>{timeLabel}</Text> : null}
              </View>
            </Pressable>
            <View style={styles.followRequestActions}>
              <Pressable
                style={[styles.acceptBtn, isRequestBusy && styles.acceptBtnDisabled]}
                onPress={() => void handleAcceptFollowRequest(item)}
                disabled={isRequestBusy}
              >
                {isRequestBusy ? (
                  <ActivityIndicator size="small" color={theme.bg} />
                ) : (
                  <Text style={styles.acceptBtnText}>{t("followRequest.accept")}</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.declineBtn}
                onPress={() => void handleDeclineFollowRequest(item)}
                disabled={isRequestBusy}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>
        );
      }

      if (item.kind === "follow_request_accepted") {
        return (
          <Pressable
            style={[styles.row, item.isUnread && styles.rowUnread]}
            onPress={() => handleSocialPress(item)}
          >
            <AvatarImage uri={item.profile.avatar_url} style={styles.avatar} />
            <View style={styles.rowMain}>
              {display ? (
                <Text style={styles.displayNamePrimary} numberOfLines={1}>
                  {display}
                </Text>
              ) : (
                <Text style={styles.usernameMuted} numberOfLines={1}>
                  {handle}
                </Text>
              )}
              <Text style={styles.action}>{actionLabel}</Text>
              {timeLabel ? <Text style={styles.timeInline}>{timeLabel}</Text> : null}
            </View>
            <View style={styles.acceptedIconWrap}>
              <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
            </View>
          </Pressable>
        );
      }

      return (
        <Pressable
          style={[styles.row, item.isUnread && styles.rowUnread]}
          onPress={() => handleSocialPress(item)}
        >
          <AvatarImage uri={item.profile.avatar_url} style={styles.avatar} />
          <View style={styles.rowMain}>
            <View style={styles.rowTop}>
              <Text style={styles.username} numberOfLines={1}>
                @{uname}
              </Text>
              {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
            </View>
            {display ? (
              <Text style={styles.displayName} numberOfLines={1}>
                {display}
              </Text>
            ) : null}
            <Text style={styles.action}>{actionLabel}</Text>
            {commentPreview ? (
              <Text style={styles.commentPreview} numberOfLines={2}>
                {commentPreview}
              </Text>
            ) : null}
          </View>
          {(item.kind === "like" || item.kind === "comment") && item.postThumbnailUrl ? (
            <Image source={{ uri: item.postThumbnailUrl }} style={styles.postThumb} />
          ) : null}
        </Pressable>
      );
    },
    [
      handleAcceptFollowRequest,
      handleDeclineFollowRequest,
      handleSocialPress,
      requestBusy,
      styles,
      t,
      theme,
    ]
  );

  const renderOrderItem = useCallback(
    ({ item }: { item: OrderNotificationItem }) => {
      const timeLabel = formatRelativeTimeNl(item.notification.createdAt);
      return (
        <Pressable
          style={[styles.orderRow, item.isUnread && styles.rowUnread]}
          onPress={() => handleOrderPress(item)}
        >
          {item.productThumbnailUrl ? (
            <Image source={{ uri: item.productThumbnailUrl }} style={styles.orderThumb} />
          ) : (
            <View style={styles.orderThumbFallback}>
              <Ionicons name="cube-outline" size={20} color={theme.textMuted} />
            </View>
          )}
          <View style={styles.rowMain}>
            <Text style={styles.orderTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.orderSubtitle} numberOfLines={2}>
              {item.subtitle}
            </Text>
            {item.buyerName ? (
              <Text style={styles.orderMeta} numberOfLines={1}>
                {item.buyerName}
              </Text>
            ) : null}
            {timeLabel ? <Text style={styles.timeInline}>{timeLabel}</Text> : null}
          </View>
          {item.needsAction ? (
            <View style={styles.actionChip}>
              <Ionicons name="time-outline" size={14} color={theme.accent} />
            </View>
          ) : item.isHandled ? (
            <View style={styles.handledIconWrap}>
              <Ionicons name="checkmark-circle" size={22} color="#34C759" />
            </View>
          ) : null}
        </Pressable>
      );
    },
    [handleOrderPress, styles, theme]
  );

  const bottomPad = 100 + Math.max(insets.bottom, 0);
  const showOrdersTab = isBusinessSeller;

  if (!user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.screenTitle}>{t("activityCenter.title")}</Text>
        <View style={[styles.guestBox, { paddingBottom: bottomPad }]}>
          <Text style={styles.guestText}>{t("activityCenter.guestBody")}</Text>
          <Pressable
            style={styles.guestBtn}
            onPress={() =>
              openAuthPrompt({ message: t("activityCenter.guestLoginPrompt") })
            }
          >
            <Text style={styles.guestBtnText}>{t("auth.login")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.screenTitle}>{t("activityCenter.title")}</Text>

      <ActivitySectionTabs
        active={activeSection}
        onChange={handleSectionChange}
        activityUnreadCount={activityUnreadCount}
        ordersUnreadCount={ordersUnreadCount}
        showOrdersTab={showOrdersTab}
      />

      {loading && !refreshing ? (
        <View style={[styles.centerState, { paddingBottom: bottomPad }]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : activeSection === "orders" ? (
        <FlatList
          data={orderItems}
          keyExtractor={(item) => `order-${item.notification.id}`}
          renderItem={renderOrderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          ListHeaderComponent={
            isBusinessSeller && actionCount > 0 ? (
              <SellerActionRequiredCard
                actionCount={actionCount}
                onPress={() =>
                  navigation.navigate("MyShop", {
                    initialTab: "orders",
                    orderFilter: "action_required",
                  })
                }
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="cube-outline" size={32} color={theme.textMuted} />
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>{t("activityCenter.emptyOrdersTitle")}</Text>
                  <Text style={styles.emptyBody}>{t("activityCenter.emptyOrdersBody")}</Text>
                </>
              )}
            </View>
          }
        />
      ) : (
        <FlatList
          data={socialItems}
          keyExtractor={(item) => `${item.kind}-${item.activityKey}`}
          renderItem={renderSocialItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Ionicons name="heart-outline" size={32} color={theme.textMuted} />
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>
                    {t("activityCenter.emptyActivityTitle")}
                  </Text>
                  <Text style={styles.emptyBody}>{t("activityCenter.emptyActivityBody")}</Text>
                </>
              )}
            </View>
          }
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
      paddingHorizontal: 16,
    },
    screenTitle: {
      color: theme.text,
      fontSize: 24,
      fontWeight: "700",
      marginBottom: 12,
    },
    listContent: {
      flexGrow: 1,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowUnread: {
      backgroundColor: theme.accentSoft,
    },
    orderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.bgElevated,
    },
    rowMain: {
      flex: 1,
      minWidth: 0,
    },
    rowTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    username: {
      flex: 1,
      color: theme.text,
      fontSize: 16,
      fontWeight: "600",
    },
    time: {
      color: theme.textMuted,
      fontSize: 13,
    },
    displayName: {
      color: theme.textMuted,
      fontSize: 14,
      marginTop: 2,
    },
    action: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 4,
    },
    commentPreview: {
      color: theme.text,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 4,
    },
    postThumb: {
      width: 44,
      height: 44,
      borderRadius: 6,
      backgroundColor: theme.bgElevated,
    },
    orderThumb: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: theme.bgElevated,
    },
    orderThumbFallback: {
      width: 48,
      height: 48,
      borderRadius: 8,
      backgroundColor: theme.bgElevated,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    orderTitle: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
    },
    orderSubtitle: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
    },
    orderMeta: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    actionChip: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: theme.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    handledIconWrap: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
    },
    followRequestMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      minWidth: 0,
    },
    followRequestActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: 8,
    },
    acceptBtn: {
      minHeight: 34,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: theme.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    acceptBtnDisabled: {
      opacity: 0.75,
    },
    acceptBtnText: {
      color: theme.bg,
      fontSize: 13,
      fontWeight: "700",
    },
    declineBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    acceptedIconWrap: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4,
    },
    displayNamePrimary: {
      color: theme.text,
      fontSize: 15,
      fontWeight: "700",
    },
    usernameMuted: {
      color: theme.textMuted,
      fontSize: 13,
      marginTop: 1,
    },
    timeInline: {
      color: theme.textMuted,
      fontSize: 12,
      marginTop: 4,
    },
    centerState: {
      paddingVertical: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyWrap: {
      paddingVertical: 40,
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
    },
    emptyTitle: {
      color: theme.text,
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
    },
    emptyBody: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: "center",
    },
    errorText: {
      color: theme.textMuted,
      fontSize: 14,
      textAlign: "center",
      paddingHorizontal: 12,
    },
    guestBox: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 8,
    },
    guestText: {
      color: theme.textMuted,
      fontSize: 15,
      textAlign: "center",
      marginBottom: 16,
    },
    guestBtn: {
      backgroundColor: theme.accent,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    guestBtnText: {
      color: "#0B0B0B",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
