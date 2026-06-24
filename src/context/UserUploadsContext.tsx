import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import { useGlobalFeed } from "./GlobalFeedContext";
import { useLikes } from "./LikesContext";
import { deleteMyPost, fetchUserPosts } from "../services/postsService";
import { isUserVideoPost, type UserVideoPost } from "../types/userVideoPost";

export type { UserVideoPost };

type UserUploadsValue = {
  /** Video posts uit Supabase (R2-URL) + bovenaan in reels/profiel. */
  uploadedVideoPosts: UserVideoPost[];
  /** Lokaal: na geslaagde insert, of opnieuw laden. */
  addUserVideoPost: (post: UserVideoPost) => void;
  /** Volledig verversen van de server. */
  refreshUserVideoPosts: () => Promise<void>;
  /** Zacht verwijderen in DB + lokaal uit de lijst. */
  deleteUserVideoPost: (id: string) => Promise<void>;
  remoteLoading: boolean;
  remoteError: string | null;
};

const UserUploadsContext = createContext<UserUploadsValue | null>(null);

export function UserUploadsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { syncFeedLikeState } = useLikes();
  const { refreshGlobalFeed } = useGlobalFeed();
  const authUserId = user?.id ?? "";

  const [uploadedVideoPosts, setUploadedVideoPosts] = useState<UserVideoPost[]>(
    []
  );
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const refreshUserVideoPosts = useCallback(async () => {
    if (!authUserId) {
      setUploadedVideoPosts([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      // Alleen huidige gebruiker (niet de globale feed).
      const rows = await fetchUserPosts(authUserId, "own_profile");
      if (rows !== undefined) {
        setUploadedVideoPosts(rows);
      }
      if (__DEV__ && rows !== undefined) {
        console.log("[UserUploads] restored uploads count", rows.length);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kon posts niet laden";
      setRemoteError(msg);
      if (__DEV__) {
        console.warn("[UserUploads]", msg);
      }
    } finally {
      setRemoteLoading(false);
    }
  }, [authUserId]);

  useEffect(() => {
    void refreshUserVideoPosts();
  }, [refreshUserVideoPosts]);

  useEffect(() => {
    if (!user?.id || uploadedVideoPosts.length === 0) {
      return;
    }
    syncFeedLikeState(uploadedVideoPosts);
  }, [user?.id, uploadedVideoPosts, syncFeedLikeState]);

  const addUserVideoPost = useCallback((post: UserVideoPost) => {
    if (!isUserVideoPost(post)) {
      return;
    }
    setUploadedVideoPosts((prev) => {
      const rest = prev.filter((p) => p.id !== post.id);
      return [post, ...rest];
    });
  }, []);

  const deleteUserVideoPost = useCallback(
    async (id: string) => {
      if (!authUserId) {
        throw new Error("Log in om een post te verwijderen.");
      }
      await deleteMyPost(id);
      setUploadedVideoPosts((prev) => prev.filter((p) => p.id !== id));
      await refreshGlobalFeed({ force: true });
    },
    [authUserId, refreshGlobalFeed]
  );

  const value = useMemo(
    () => ({
      uploadedVideoPosts,
      addUserVideoPost,
      refreshUserVideoPosts,
      deleteUserVideoPost,
      remoteLoading,
      remoteError,
    }),
    [
      uploadedVideoPosts,
      addUserVideoPost,
      refreshUserVideoPosts,
      deleteUserVideoPost,
      remoteLoading,
      remoteError,
    ]
  );

  return (
    <UserUploadsContext.Provider value={value}>
      {children}
    </UserUploadsContext.Provider>
  );
}

export function useUserUploads(): UserUploadsValue {
  const ctx = useContext(UserUploadsContext);
  if (!ctx) {
    throw new Error("useUserUploads must be used within UserUploadsProvider");
  }
  return ctx;
}
