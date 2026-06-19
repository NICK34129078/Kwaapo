import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { isSupabaseClientConfigured } from "../config/env";
import { supabase } from "../lib/supabase";
import { formatAuthError } from "../utils/authErrorMessages";
import { clearSavedStatusCache } from "../services/savedPostsService";

function safeAuthLog(scope: string, message: string): void {
  if (__DEV__) {
    console.warn(`[Auth] ${scope}:`, message);
  }
}

export type SignUpResult = {
  error: Error | null;
  /** true als account is aangemaakt maar er nog geen sessie is (e-mailbevestiging nodig). */
  needsEmailConfirmation?: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseClientConfigured()) {
      safeAuthLog(
        "config",
        "Supabase URL/key ontbreken of URL is geen https:// — Auth-requests slagen niet. Controleer .env en herstart Metro."
      );
      setSession(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        if (__DEV__) {
          console.log("[Auth] calling getSession");
        }
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) {
          return;
        }
        if (__DEV__) {
          if (error) {
            console.warn("[Auth] getSession error:", error.message);
          } else {
            console.log("[Auth] getSession success", {
              hasSession: data.session != null,
            });
          }
        }
        if (error) {
          safeAuthLog(
            "getSession",
            `${error.message} (controleer URL, netwerk, en of Expo .env geladen is)`
          );
        }
        setSession(data.session ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (__DEV__) {
          console.warn("[Auth] getSession threw:", msg);
        }
        safeAuthLog(
          "getSession",
          `${msg} — vaak netwerk/DNS of verkeerde Supabase URL`
        );
        if (!cancelled) {
          setSession(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) {
        return;
      }
      try {
        if (nextSession == null) {
          // Bij uitloggen/accountwissel: bookmark-cache leegmaken.
          clearSavedStatusCache();
        }
        setSession(nextSession);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        safeAuthLog("onAuthStateChange", msg);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim();
    if (__DEV__) {
      console.log("[Auth] calling signUp");
    }
    const { data, error } = await supabase.auth.signUp({
      email: trimmed,
      password,
    });

    if (__DEV__) {
      console.log("[Auth] signUp result", {
        hasError: !!error,
        code: error?.code ?? null,
        message: error?.message ?? null,
        hasSession: data.session != null,
        hasUser: data.user != null,
      });
    }

    if (error) {
      return {
        error: new Error(formatAuthError(error, "signUp")),
        needsEmailConfirmation: false,
      };
    }

    const needsEmailConfirmation = data.session == null && data.user != null;

    if (__DEV__ && needsEmailConfirmation) {
      console.log(
        "[Auth] signUp success: session null → e-mailbevestiging verwacht"
      );
    }

    return {
      error: null,
      needsEmailConfirmation,
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const trimmed = email.trim();
    if (__DEV__) {
      console.log("[Auth] calling signIn");
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    if (__DEV__) {
      if (error) {
        console.warn("[Auth] signIn error:", {
          code: error.code ?? null,
          message: error.message ?? null,
        });
      } else {
        console.log("[Auth] signIn ok");
      }
    }
    if (error) {
      return { error: new Error(formatAuthError(error, "signIn")) };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error ? new Error(error.message) : null };
  }, []);

  const user = session?.user ?? null;

  useEffect(() => {
    if (__DEV__ && session?.user?.id) {
      console.log("[Auth user] current user.id", session.user.id);
    }
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      signUp,
      signIn,
      signOut,
    }),
    [user, session, loading, signUp, signIn, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
