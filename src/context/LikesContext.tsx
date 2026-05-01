import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type PerPost = {
  likesCount: number;
  isLikedByCurrentUser: boolean;
};

type LikesContextValue = {
  /** Afgesloten toestand: basis uit post of overschreven na toggle */
  getLikeState: (postId: string, defaultLikesCount: number) => PerPost;
  /** Optimistische toggle: past count en liked in één keer aan */
  toggleLike: (postId: string, defaultLikesCount: number) => void;
};

const LikesContext = createContext<LikesContextValue | null>(null);

export function LikesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Record<string, PerPost>>({});

  const getLikeState = useCallback(
    (postId: string, defaultLikesCount: number): PerPost => {
      const s = overrides[postId];
      if (s) {
        return {
          likesCount: s.likesCount,
          isLikedByCurrentUser: s.isLikedByCurrentUser,
        };
      }
      return {
        likesCount: defaultLikesCount,
        isLikedByCurrentUser: false,
      };
    },
    [overrides]
  );

  const toggleLike = useCallback(
    (postId: string, defaultLikesCount: number) => {
      setOverrides((prev) => {
        const current = prev[postId] ?? {
          likesCount: defaultLikesCount,
          isLikedByCurrentUser: false,
        };
        const wasLiked = current.isLikedByCurrentUser;
        const nextLiked = !wasLiked;
        const delta = nextLiked ? 1 : -1;
        return {
          ...prev,
          [postId]: {
            likesCount: Math.max(0, current.likesCount + delta),
            isLikedByCurrentUser: nextLiked,
          },
        };
      });
    },
    []
  );

  const value = useMemo(
    () => ({ getLikeState, toggleLike }),
    [getLikeState, toggleLike]
  );

  return (
    <LikesContext.Provider value={value}>{children}</LikesContext.Provider>
  );
}

export function useLikes(): LikesContextValue {
  const ctx = useContext(LikesContext);
  if (!ctx) {
    throw new Error("useLikes must be used within LikesProvider");
  }
  return ctx;
}

/** Voor `FeedItem`: huidige count + like status + tap handler */
export function useReelLike(
  postId: string,
  defaultLikesCount: number
): {
  likesCount: number;
  isLikedByCurrentUser: boolean;
  onToggleLike: () => void;
} {
  const { getLikeState, toggleLike } = useLikes();
  const s = getLikeState(postId, defaultLikesCount);
  const onToggleLike = useCallback(() => {
    toggleLike(postId, defaultLikesCount);
  }, [postId, defaultLikesCount, toggleLike]);
  return {
    likesCount: s.likesCount,
    isLikedByCurrentUser: s.isLikedByCurrentUser,
    onToggleLike,
  };
}
