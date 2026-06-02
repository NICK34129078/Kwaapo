import { supabase } from "../lib/supabase";

const CLICK_FETCH_LIMIT = 1000;

export type MyShopPostStat = {
  postId: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  productTitle?: string | null;
  productBrand?: string | null;
  productPriceText?: string | null;
  productUrl?: string | null;
  clickCount: number;
  latestClickAt?: string | null;
};

type ShopPostRow = {
  id: string;
  caption: string | null;
  thumbnail_url: string | null;
  product_title: string | null;
  product_brand: string | null;
  product_price_text: string | null;
  product_url: string | null;
};

type ProductClickRow = {
  post_id: string;
  created_at: string;
};

function aggregateClicks(
  rows: ProductClickRow[]
): Map<string, { clickCount: number; latestClickAt: string | null }> {
  const map = new Map<string, { clickCount: number; latestClickAt: string | null }>();

  for (const row of rows) {
    const prev = map.get(row.post_id) ?? {
      clickCount: 0,
      latestClickAt: null as string | null,
    };
    prev.clickCount += 1;
    if (
      prev.latestClickAt == null ||
      new Date(row.created_at).getTime() >
        new Date(prev.latestClickAt).getTime()
    ) {
      prev.latestClickAt = row.created_at;
    }
    map.set(row.post_id, prev);
  }

  return map;
}

/**
 * Shop-post stats voor de ingelogde creator (product clicks via RLS).
 * Eigen clicks (viewer_id = creator) worden bewust uitgesloten voor eerlijke statistieken.
 * Later uitbreidbaar met likes/views.
 */
export async function fetchMyShopPostStats(): Promise<MyShopPostStat[]> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      throw userError;
    }
    if (!user?.id) {
      return [];
    }

    const userId = user.id;

    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(
        "id, caption, thumbnail_url, product_title, product_brand, product_price_text, product_url"
      )
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .eq("is_shop_post", true)
      .order("created_at", { ascending: false });

    if (postsError) {
      throw postsError;
    }

    const { data: clicksData, error: clicksError } = await supabase
      .from("product_clicks")
      .select("post_id, created_at")
      .eq("creator_id", userId)
      .neq("viewer_id", userId)
      .order("created_at", { ascending: false })
      .limit(CLICK_FETCH_LIMIT);

    if (clicksError) {
      throw clicksError;
    }

    const clickByPost = aggregateClicks((clicksData ?? []) as ProductClickRow[]);
    const posts = (postsData ?? []) as ShopPostRow[];

    return posts.map((row) => {
      const stats = clickByPost.get(row.id);
      return {
        postId: row.id,
        caption: row.caption,
        thumbnailUrl: row.thumbnail_url,
        productTitle: row.product_title,
        productBrand: row.product_brand,
        productPriceText: row.product_price_text,
        productUrl: row.product_url,
        clickCount: stats?.clickCount ?? 0,
        latestClickAt: stats?.latestClickAt ?? null,
      };
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[CreatorStats] fetch failed:", msg);
    return [];
  }
}
