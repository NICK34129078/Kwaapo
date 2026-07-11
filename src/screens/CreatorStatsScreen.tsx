import React, { useCallback, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useThemedStyles } from "../hooks/useThemedStyles";
import type { AppTheme } from "../constants/theme";
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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchMyShopPostStats,
  type MyShopPostStat,
} from "../services/creatorStatsService";

function formatLatestClick(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildProductMeta(stat: MyShopPostStat): string {
  const styles = useThemedStyles(createStyles);

  const parts: string[] = [];
  const brand = stat.productBrand?.trim();
  const price = stat.productPriceText?.trim();
  if (brand) {
    parts.push(brand);
  }
  if (price) {
    parts.push(price);
  }
  return parts.join(" · ");
}

function StatRow({ stat }: { stat: MyShopPostStat }) {
  const { theme } = useTheme();

  const styles = useThemedStyles(createStyles);

  const title =
    stat.productTitle?.trim() ||
    stat.caption?.trim() ||
    "Shop-post";
  const meta = buildProductMeta(stat);
  const latest = formatLatestClick(stat.latestClickAt);

  return (
    <View style={styles.row}>
      {stat.thumbnailUrl ? (
        <Image source={{ uri: stat.thumbnailUrl }} style={styles.thumb} />
      ) : (
        <View style={styles.thumbFallback}>
          <Ionicons name="bag-outline" size={22} color={theme.textMuted} />
        </View>
      )}
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        {meta.length > 0 ? (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <Text style={styles.rowClicks}>
          {stat.clickCount === 1 ? "1 klik" : `${stat.clickCount} kliks`}
        </Text>
        {latest ? (
          <Text style={styles.rowLatest}>Laatste klik: {latest}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function CreatorStatsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MyShopPostStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchMyShopPostStats();
    setItems(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  const totalClicks = useMemo(
    () => items.reduce((sum, row) => sum + row.clickCount, 0),
    [items]
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <Text style={styles.subtitle}>
          Bekijk welke productposts clicks krijgen.
        </Text>
        <View style={styles.totalsRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{totalClicks}</Text>
            <Text style={styles.totalLabel}>Totaal kliks</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{items.length}</Text>
            <Text style={styles.totalLabel}>Shop-posts</Text>
          </View>
        </View>
      </View>
    ),
    [totalClicks, items.length]
  );

  const renderItem = useCallback(
    ({ item }: { item: MyShopPostStat }) => <StatRow stat={item} />,
    []
  );

  const keyExtractor = useCallback((item: MyShopPostStat) => item.postId, []);

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
        <Text style={styles.screenTitle}>Shop statistieken</Text>
        <View style={styles.topBarSide} />
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={listHeader}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: 32 + insets.bottom },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
              colors={[theme.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.emptyTitle}>Nog geen shop-statistieken</Text>
              <Text style={styles.emptyText}>
                Voeg een productlink toe aan een upload om clicks te meten.
              </Text>
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -8,
  },
  topBarSide: {
    width: 40,
  },
  screenTitle: {
    flex: 1,
    color: theme.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  headerBlock: {
    marginBottom: 16,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  totalsRow: {
    flexDirection: "row",
    gap: 12,
  },
  totalCard: {
    flex: 1,
    backgroundColor: theme.bgElevated,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  totalValue: {
    color: theme.text,
    fontSize: 24,
    fontWeight: "800",
  },
  totalLabel: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  listContent: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: theme.bgElevated,
  },
  thumbFallback: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: theme.bgElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: theme.text,
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    color: theme.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  rowClicks: {
    color: theme.accent,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  rowLatest: {
    color: theme.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  centerState: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  emptyTitle: {
    color: theme.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
}

