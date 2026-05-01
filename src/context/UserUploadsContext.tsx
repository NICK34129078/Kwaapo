import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isAppUserIdConfigured } from "../config/env";
import { fetchUserVideoPosts, softDeletePost } from "../services/postsService";
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
  const [uploadedVideoPosts, setUploadedVideoPosts] = useState<UserVideoPost[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const refreshUserVideoPosts = useCallback(async () => {
    if (!isAppUserIdConfigured()) {
      setUploadedVideoPosts([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const rows = await fetchUserVideoPosts();
      setUploadedVideoPosts(rows);
      if (__DEV__) {
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
  }, []);

  useEffect(() => {
    void refreshUserVideoPosts();
  }, [refreshUserVideoPosts]);

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
      if (isAppUserIdConfigured()) {
        try {
          await softDeletePost(id);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Verwijderen mislukt";
          if (__DEV__) {
            console.error("[UserUploads] delete", msg);
          }
          throw e;
        }
      }
      setUploadedVideoPosts((prev) => prev.filter((p) => p.id !== id));
    },
    []
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
