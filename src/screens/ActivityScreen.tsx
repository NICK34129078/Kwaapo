import React, { useCallback, useEffect, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "../constants/theme";
import { useAuth } from "../context/AuthContext";
import { useAuthPrompt } from "../context/AuthPromptContext";
import { supabase } from "../lib/supabase";

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type ActivityKind = "follow" | "like";

export type ActivityFeedItem = {
  kind: ActivityKind;
  created_at: string;
  actorId: string;
  profile: ProfileRow;
  /** Alleen bij like; post staat in public.posts */
  postId?: string;
};

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

const ID_BATCH = 80;

async function fetchProfilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter((id) => id.length > 0))];
  const map = new Map<string, ProfileRow>();
  if (unique.length === 0) {
    return map;
  }

  for (let i = 0; i < unique.length; i += ID_BATCH) {
    const slice = unique.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", slice);

    if (error) {
      throw error;
    }
    for (const p of (data ?? []) as ProfileRow[]) {
      map.set(p.id, p);
    }
  }
  return map;
}

/** Volgers: wie mij volgt (geen zelf-follow). */
async function fetchFollowActivities(
  userId: string
): Promise<Omit<ActivityFeedItem, "profile">[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, created_at")
    .eq("following_id", userId)
    .neq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as { follower_id: string; created_at: string }[];
  return rows.map((r) => ({
    kind: "follow" as const,
    created_at: r.created_at,
    actorId: r.follower_id,
  }));
}

/**
 * Likes op eigen posts die in `public.posts` staan.
 * Eigen likes (user_id = ik) worden uitgesloten.
 */
async function fetchLikeActivities(
  userId: string
): Promise<Omit<ActivityFeedItem, "profile">[]> {
  const { data: postsRows, error: postsError } = await supabase
    .from("posts")
    .select("id")
    .eq("user_id", userId)
    .eq("is_deleted", false);

  if (postsError) {
    throw postsError;
  }

  const postIds = [
    ...new Set(
      ((postsRows ?? []) as { id: string }[]).map((p) => p.id).filter(Boolean)
    ),
  ];
  if (postIds.length === 0) {
    return [];
  }

  type LikeRow = { post_id: string; user_id: string; created_at: string };
  const collected: LikeRow[] = [];

  for (let i = 0; i < postIds.length; i += ID_BATCH) {
    const slice = postIds.slice(i, i + ID_BATCH);
    const { data, error } = await supabase
      .from("post_likes")
      .select("post_id, user_id, created_at")
      .in("post_id", slice)
      .neq("user_id", userId);

    if (error) {
      throw error;
    }
    for (const row of (data ?? []) as LikeRow[]) {
      if (row.user_id !== userId) {
        collected.push(row);
      }
    }
  }

  collected.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const top = collected.slice(0, 100);

  return top.map((r) => ({
    kind: "like" as const,
    created_at: r.created_at,
    actorId: r.user_id,
    postId: r.post_id,
  }));
}

async function fetchActivityFeed(userId: string): Promise<ActivityFeedItem[]> {
  const [followParts, likeParts] = await Promise.all([
    fetchFollowActivities(userId),
    fetchLikeActivities(userId),
  ]);

  const raw = [...followParts, ...likeParts];
  const actorIds = raw.map((r) => r.actorId);
  const profiles = await fetchProfilesByIds(actorIds);

  const items: ActivityFeedItem[] = [];
  for (const part of raw) {
    const profile = profiles.get(part.actorId);
    if (!profile) {
      continue;
    }
    items.push({
      ...part,
      profile,
    });
  }

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return items;
}

export function ActivityScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openAuthPrompt } = useAuthPrompt();

  const [items, setItems] = useState<ActivityFeedItem[]>([]);
  const [loading, setLoading] = useState(() => !!user?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    setError(null);
    try {
      const next = await fetchActivityFeed(user.id);
      setItems(next);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Kon activiteit niet laden.";
      setError(msg);
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    void load();
  }, [user?.id, load]);

  const onRefresh = useCallback(() => {
    if (!user?.id) {
      return;
    }
    setRefreshing(true);
    void load();
  }, [user?.id, load]);

  const bottomPad = 100 + Math.max(insets.bottom, 0);

  const renderItem = useCallback(
    ({ item }: { item: ActivityFeedItem }) => {
      const uname = item.profile.username?.trim() || "gebruiker";
      const display = item.profile.display_name?.trim();
      const timeLabel = formatRelativeTimeNl(item.created_at);
      const actionLabel =
        item.kind === "follow"
          ? "volgt je nu"
          : "heeft je video geliket";

      return (
        <Pressable
          style={styles.row}
          onPress={() =>
            navigation.navigate("PublicProfile", {
              profileId: item.actorId,
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`Profiel ${uname}`}
        >
          {item.profile.avatar_url ? (
            <Image
              source={{ uri: item.profile.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText} numberOfLines={1}>
                {uname.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}

          <View style={styles.rowMain}>
            <View style={styles.rowTop}>
              <Text style={styles.username} numberOfLines={1}>
                @{uname}
              </Text>
              {timeLabel ? (
                <Text style={styles.time}>{timeLabel}</Text>
              ) : null}
            </View>
            {display ? (
              <Text style={styles.displayName} numberOfLines={1}>
                {display}
              </Text>
            ) : null}
            <Text style={styles.action}>{actionLabel}</Text>
          </View>
        </Pressable>
      );
    },
    [navigation]
  );

  const keyExtractor = useCallback((item: ActivityFeedItem) => {
    return `${item.kind}-${item.actorId}-${item.created_at}-${
      item.postId ?? ""
    }`;
  }, []);

  if (!user) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.screenTitle}>Activiteit</Text>
        <View style={[styles.guestBox, { paddingBottom: bottomPad }]}>
          <Text style={styles.guestText}>
            Log in om meldingen over volgers en likes te zien.
          </Text>
          <Pressable
            style={styles.guestBtn}
            onPress={() =>
              openAuthPrompt({ message: "Log in om activiteit te bekijken." })
            }
            accessibilityRole="button"
            accessibilityLabel="Inloggen"
          >
            <Text style={styles.guestBtnText}>Inloggen</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.screenTitle}>Activiteit</Text>

      {loading && !refreshing ? (
        <View style={[styles.centerState, { paddingBottom: bottomPad }]}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: bottomPad },
          ]}
          ListEmptyComponent={
            <View style={styles.centerState}>
              {error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : (
                <Text style={styles.emptyText}>Nog geen activiteit</Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgElevated,
  },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bgElevated,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: "600",
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
  centerState: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 15,
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
