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

function safeAuthLog(scope: string, message: string): void {
  if (__DEV__) {
    console.warn(`[Auth] ${scope}:`, message);
  }
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
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
    if (__DEV__) {
      console.log("[Auth] calling signUp");
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (__DEV__) {
      if (error) {
        console.warn("[Auth] signUp error:", error.message);
      } else {
        console.log("[Auth] signUp ok");
      }
    }
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (__DEV__) {
      console.log("[Auth] calling signIn");
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (__DEV__) {
      if (error) {
        console.warn("[Auth] signIn error:", error.message);
      } else {
        console.log("[Auth] signIn ok");
      }
    }
    return { error: error ? new Error(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error: error ? new Error(error.message) : null };
  }, []);

  const user = session?.user ?? null;

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
