import { supabase } from "../lib/supabase";

export type MyTagPreference = {
  tag: string;
  score: number;
  viewsCount: number;
  positiveViewsCount: number;
  negativeViewsCount: number;
  lastInteractionAt: string;
};

type TagPrefRow = {
  tag: string;
  score: number | string | null;
  views_count?: number | string | null;
  positive_views_count?: number | string | null;
  negative_views_count?: number | string | null;
  last_interaction_at?: string | null;
};

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return v;
  }
  if (typeof v === "string" && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function mapRow(row: TagPrefRow): MyTagPreference {
  return {
    tag: typeof row.tag === "string" ? row.tag : String(row.tag ?? ""),
    score: toNum(row.score),
    viewsCount: toNum(row.views_count),
    positiveViewsCount: toNum(row.positive_views_count),
    negativeViewsCount: toNum(row.negative_views_count),
    lastInteractionAt:
      typeof row.last_interaction_at === "string"
        ? row.last_interaction_at
        : "",
  };
}

/**
 * Top tag-voorkeuren van de ingelogde gebruiker (read-only, voor debug / inzicht).
 */
export async function fetchMyTagPreferences(): Promise<MyTagPreference[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("user_tag_preferences")
    .select(
      "tag, score, views_count, positive_views_count, negative_views_count, last_interaction_at"
    )
    .eq("user_id", user.id)
    .order("score", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[AlgorithmInsights] fetch failed:", error.message);
    return [];
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  return (data as TagPrefRow[]).map(mapRow);
}
