import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

import { isSupabaseClientConfigured } from "../config/env";
import { supabase } from "../lib/supabase";
import { formatAuthError } from "../utils/authErrorMessages";
import { parseSupabaseAuthParamsFromUrl, isPasswordRecoveryDeepLink } from "../utils/authDeepLink";
import { isPasswordRecoveryAuthEvent } from "../utils/authRecoveryState";
import { logPasswordResetRedirectUrl } from "../constants/authLinks";
import {
  clearLocalAuthCaches,
  clearSupabaseAuthStorage,
  invalidateStaleAuthSession,
  isAuthSessionError,
  isValidAuthUser,
  onAuthSessionInvalidated,
  validateAuthUserFromServerWithDefaults,
} from "../utils/authSession";
import { getSupabaseAuthStorageKey } from "../utils/authSessionValidation";
import { env } from "../config/env";
import {
  LOGIN_INVALID_CREDENTIALS_MESSAGE,
  performLoginAttempt,
} from "../utils/authLoginFlow";

function authBootstrapLog(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.log(`[AuthContext] ${message}`, extra);
    return;
  }
  console.log(`[AuthContext] ${message}`);
}

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
  /** Sessie was ongeldig (bv. account server-side verwijderd) — toon inlogscherm. */
  loginRequired: boolean;
  clearLoginRequired: () => void;
  passwordRecoveryPending: boolean;
  clearPasswordRecoveryPending: () => void;
  completePasswordReset: (password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ error: Error | null }>;
  /** Alleen na geslaagde signInWithPassword vanuit loginhandler. */
  applyLoginSuccess: (session: Session, user: User) => void;
  signOut: () => Promise<{ error: Error | null }>;
  /** Centrale invalidatie bij 401 / refresh-fout / ontbrekende auth.users. */
  invalidateSession: (reason: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  authBootstrapLog("AuthProvider mounted", {
    sourceFile: "src/context/AuthContext.tsx",
  });

  const [session, setSession] = useState<Session | null>(null);
  const [validatedUser, setValidatedUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginRequired, setLoginRequired] = useState(false);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const bootstrapDoneRef = useRef(false);

  const applySignedOutState = useCallback(() => {
    setSession(null);
    setValidatedUser(null);
    clearLocalAuthCaches();
  }, []);

  const invalidateSession = useCallback(async (reason: string) => {
    applySignedOutState();
    setLoginRequired(true);
    await invalidateStaleAuthSession(reason);
  }, [applySignedOutState]);

  useEffect(() => {
    logPasswordResetRedirectUrl("Auth startup");
  }, []);

  useEffect(() => {
    return onAuthSessionInvalidated(() => {
      applySignedOutState();
      setLoginRequired(true);
    });
  }, [applySignedOutState]);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseClientConfigured()) {
      safeAuthLog(
        "config",
        "Supabase URL/key ontbreken of URL is geen https:// — Auth-requests slagen niet. Controleer .env en herstart Metro."
      );
      setSession(null);
      setValidatedUser(null);
      setLoading(false);
      bootstrapDoneRef.current = true;
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        authBootstrapLog("AUTH_BOOTSTRAP_START");

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        authBootstrapLog("getSession result", {
          hasSession: sessionData.session != null,
          sessionUserId: sessionData.session?.user?.id ?? null,
          sessionError: sessionError?.message ?? null,
        });

        if (sessionError && isAuthSessionError(sessionError)) {
          authBootstrapLog("INVALIDATING_DELETED_USER", {
            reason: "getSession_auth_error",
            error: sessionError.message,
          });
          await supabase.auth.signOut({ scope: "local" });
          authBootstrapLog("LOCAL_SIGN_OUT_DONE");
          await clearSupabaseAuthStorage();
          authBootstrapLog("AUTH_STORAGE_KEY_REMOVED", {
            key: getSupabaseAuthStorageKey(env.supabaseUrl),
          });
          clearLocalAuthCaches();
          if (!cancelled) {
            setSession(null);
            setValidatedUser(null);
            authBootstrapLog("SET_USER_NULL");
            setLoginRequired(true);
            authBootstrapLog("SET_LOGIN_REQUIRED_TRUE");
          }
          return;
        }

        const storedSession = sessionData.session;
        if (!storedSession) {
          if (!cancelled) {
            setSession(null);
            setValidatedUser(null);
            setLoginRequired(false);
          }
          return;
        }

        authBootstrapLog("GET_USER_START");
        const { data: userData, error: userError } = await supabase.auth.getUser();
        authBootstrapLog("getUser result", {
          userId: userData.user?.id ?? null,
          error: userError?.message ?? null,
          errorStatus: userError?.status ?? null,
          errorCode: userError?.code ?? null,
        });

        if (userError || !isValidAuthUser(userData.user)) {
          authBootstrapLog("INVALIDATING_DELETED_USER", {
            reason: "getUser_failed_or_missing_user",
            error: userError?.message ?? "no_valid_user",
          });
          await supabase.auth.signOut({ scope: "local" });
          authBootstrapLog("LOCAL_SIGN_OUT_DONE");
          await clearSupabaseAuthStorage();
          authBootstrapLog("AUTH_STORAGE_KEY_REMOVED", {
            key: getSupabaseAuthStorageKey(env.supabaseUrl),
          });
          clearLocalAuthCaches();
          if (!cancelled) {
            setSession(null);
            setValidatedUser(null);
            authBootstrapLog("SET_USER_NULL");
            setLoginRequired(true);
            authBootstrapLog("SET_LOGIN_REQUIRED_TRUE");
          }
          return;
        }

        if (!cancelled) {
          setSession(storedSession);
          setValidatedUser(userData.user);
          setLoginRequired(false);
          authBootstrapLog("bootstrap validated user set", {
            userId: userData.user.id,
            loginRequired: false,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        authBootstrapLog("AUTH_BOOTSTRAP_ERROR", { message: msg });
        safeAuthLog(
          "bootstrap",
          `${msg} — vaak netwerk/DNS of verkeerde Supabase URL`
        );
        if (!cancelled) {
          applySignedOutState();
        }
      } finally {
        if (!cancelled) {
          bootstrapDoneRef.current = true;
          setLoading(false);
          authBootstrapLog("AUTH_BOOTSTRAP_FINISHED", {
            bootstrapDone: true,
            loading: false,
          });
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || !bootstrapDoneRef.current) {
        return;
      }
      try {
        if (isPasswordRecoveryAuthEvent(event)) {
          setPasswordRecoveryPending(true);
        }

        if (event === "SIGNED_OUT") {
          applySignedOutState();
          setPasswordRecoveryPending(false);
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          void (async () => {
            const { user, shouldInvalidate } =
              await validateAuthUserFromServerWithDefaults();
            if (cancelled) {
              return;
            }
            if (shouldInvalidate) {
              await invalidateSession("token_refresh_getUser_failed");
              return;
            }
            if (nextSession && user) {
              setSession(nextSession);
              setValidatedUser(user);
            }
          })();
          return;
        }

        if (nextSession == null) {
          applySignedOutState();
          return;
        }

        void (async () => {
          const { user, shouldInvalidate } =
            await validateAuthUserFromServerWithDefaults();
          if (cancelled) {
            return;
          }
          if (shouldInvalidate) {
            await invalidateSession(`auth_event_${event}`);
            return;
          }
          if (user) {
            setSession(nextSession);
            setValidatedUser(user);
            setLoginRequired(false);
          }
        })();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        safeAuthLog("onAuthStateChange", msg);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applySignedOutState, invalidateSession]);

  useEffect(() => {
    if (!isSupabaseClientConfigured()) {
      return;
    }

    const applyAuthTokensFromUrl = async (url: string) => {
      const recoveryLink = isPasswordRecoveryDeepLink(url);
      const { accessToken, refreshToken } = parseSupabaseAuthParamsFromUrl(url);
      if (!accessToken || !refreshToken) {
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        if (__DEV__) {
          console.warn("[Auth] setSession from deep link failed:", error.message);
        }
        if (isAuthSessionError(error)) {
          await invalidateSession("deep_link_setSession_failed");
        }
        return;
      }
      const { user, shouldInvalidate } =
      await validateAuthUserFromServerWithDefaults();
      if (shouldInvalidate) {
        await invalidateSession("deep_link_getUser_failed");
        return;
      }
      if (user) {
        setValidatedUser(user);
        setLoginRequired(false);
      }
      if (recoveryLink) {
        setPasswordRecoveryPending(true);
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (url) {
        void applyAuthTokensFromUrl(url);
      }
    });

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void applyAuthTokensFromUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, [invalidateSession]);

  const clearLoginRequired = useCallback(() => {
    setLoginRequired(false);
  }, []);

  const clearPasswordRecoveryPending = useCallback(() => {
    setPasswordRecoveryPending(false);
  }, []);

  const completePasswordReset = useCallback(async (password: string) => {
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return { error: new Error(formatAuthError(updateError, "signIn")) };
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      return { error: new Error(signOutError.message) };
    }
    setPasswordRecoveryPending(false);
    applySignedOutState();
    return { error: null };
  }, [applySignedOutState]);

  const signUp = useCallback(async (email: string, password: string) => {
    console.log("[AuthContext] SIGN_UP_CALLED", {
      source: "AuthContext.signUp",
      warning: "UI should use AuthCredentialsForm.handleRegister instead",
    });
    const trimmed = email.trim();
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

    if (needsEmailConfirmation) {
      return {
        error: null,
        needsEmailConfirmation,
      };
    }

    if (data.session && isValidAuthUser(data.user)) {
      setSession(data.session);
      setValidatedUser(data.user);
      setLoginRequired(false);
    }

    return {
      error: null,
      needsEmailConfirmation,
    };
  }, []);

  const applyLoginSuccess = useCallback((nextSession: Session, nextUser: User) => {
    if (!isValidAuthUser(nextUser) || nextSession == null) {
      return;
    }
    setSession(nextSession);
    setValidatedUser(nextUser);
    setLoginRequired(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    console.log("[AuthContext] SIGN_IN_WITH_PASSWORD_CALLED", { email: email.trim() });
    const result = await performLoginAttempt(email, password, (credentials) =>
      supabase.auth.signInWithPassword(credentials)
    );

    if (!result.ok) {
      console.log("[AuthContext] LOGIN_FAILED", { message: result.message });
      return { error: new Error(LOGIN_INVALID_CREDENTIALS_MESSAGE) };
    }

    console.log("[AuthContext] LOGIN_SUCCESS", { userId: result.user.id });
    applyLoginSuccess(result.session, result.user);
    return { error: null };
  }, [applyLoginSuccess]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    applySignedOutState();
    setLoginRequired(false);
    setPasswordRecoveryPending(false);
    return { error: error ? new Error(error.message) : null };
  }, [applySignedOutState]);

  const user = validatedUser;

  useEffect(() => {
    if (__DEV__ && user?.id) {
      console.log("[Auth user] validated user.id", user.id);
    }
  }, [user?.id]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      loginRequired,
      clearLoginRequired,
      passwordRecoveryPending,
      clearPasswordRecoveryPending,
      completePasswordReset,
      signUp,
      signIn,
      applyLoginSuccess,
      signOut,
      invalidateSession,
    }),
    [
      user,
      session,
      loading,
      loginRequired,
      clearLoginRequired,
      passwordRecoveryPending,
      clearPasswordRecoveryPending,
      completePasswordReset,
      signUp,
      signIn,
      applyLoginSuccess,
      signOut,
      invalidateSession,
    ]
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
