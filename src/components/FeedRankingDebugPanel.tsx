import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FeedPost } from "../data/placeholder";
import { theme } from "../constants/theme";

type Props = {
  item: FeedPost | null;
};

type TagAffinityRow = {
  tag?: string;
  affinity?: number;
  negative_skips?: number;
};

function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function FeedRankingDebugPanel({ item }: Props) {
  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => {
    if (item == null) {
      return [];
    }

    const b = item.rankingBreakdown ?? {};
    const out: string[] = ["Aanbevolen omdat:"];

    const feedSource =
      (typeof item.feedSource === "string" && item.feedSource) ||
      (typeof b.feed_source === "string" ? String(b.feed_source) : null);
    if (feedSource) {
      out.push(`- bron: ${feedSource === "personalized" ? "personalized feed" : feedSource === "explore" ? "explore fallback" : feedSource}`);
    }

    const tagAffinities = Array.isArray(b.tag_affinities)
      ? (b.tag_affinities as TagAffinityRow[])
      : [];
    if (tagAffinities.length > 0) {
      out.push("- hashtag affiniteit:");
      for (const row of tagAffinities) {
        const tag = row.tag ?? "?";
        const affinity = readNumber(row.affinity) ?? 0;
        const skips = readNumber(row.negative_skips) ?? 0;
        out.push(
          `  · #${tag}: ${formatSigned(affinity)}${skips > 0 ? ` (${skips} quick skips)` : ""}`
        );
      }
    } else if (item.tags && item.tags.length > 0) {
      out.push(
        `- hashtags: ${item.tags.map((t) => `#${t}`).join(" ")} (nog geen affinity-data)`
      );
    } else {
      out.push("- geen hashtags op post");
    }

    const scoreLines: Array<[string, unknown]> = [
      ["hashtag interesse", b.hashtag_interest],
      ["exploration", b.exploration],
      ["creator affiniteit", b.creator_affinity],
      ["engagement", b.engagement],
      ["freshness", b.freshness],
      ["watch score", b.watch_score],
      ["follow recency", b.follow_recency],
      ["quick skip penalty", b.quick_skip_penalty],
      ["no-hashtag penalty", b.no_hashtag_penalty],
      ["creator repeat penalty", b.creator_repeat_penalty],
    ];

    for (const [label, raw] of scoreLines) {
      const n = readNumber(raw);
      if (n == null || n === 0) {
        continue;
      }
      out.push(`- ${label}: ${formatSigned(n)}`);
    }

    if (b.untagged_fallback === true) {
      out.push("- untagged fallback slot (zeldzaam)");
    }

    const total = readNumber(b.total) ?? item.rankingScore ?? null;
    if (total != null) {
      out.push(`- totaal score: ${formatSigned(total)}`);
    } else {
      out.push("- totaal score: onbekend");
    }

    return out;
  }, [item]);

  if (!__DEV__ || item == null) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        style={styles.toggle}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel="Ranking debug"
      >
        <Text style={styles.toggleText}>{expanded ? "Ranking ▼" : "Ranking ▶"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.panel}>
          {lines.map((line, idx) => (
            <Text key={`${idx}-${line}`} style={styles.line}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 8,
    bottom: 120,
    zIndex: 60,
    maxWidth: "82%",
  },
  toggle: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleText: {
    color: theme.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  panel: {
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.72)",
    padding: 8,
    borderRadius: 8,
    gap: 2,
  },
  line: {
    color: theme.text,
    fontSize: 10,
    lineHeight: 14,
  },
});
