import type { AuthError, Session, User } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthBootstrapResult = {
  session: Session | null;
  user: User | null;
  loginRequired: boolean;
};

export type AuthClientLike = {
  auth: {
    getSession: () => Promise<{
      data: { session: Session | null };
      error: AuthError | null;
    }>;
    getUser: () => Promise<{
      data: { user: User | null };
      error: AuthError | null;
    }>;
    signOut: (options?: { scope?: "local" | "global" }) => Promise<{
      error: AuthError | null;
    }>;
  };
};

export type AuthSessionDeps = {
  client: AuthClientLike;
  signOutLocal: (scope: "local") => Promise<void>;
  clearStorage: () => Promise<void>;
  clearCaches: () => void;
};

export function getSupabaseAuthStorageKey(supabaseUrl: string): string {
  const host = supabaseUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  const ref = host.split(".")[0];
  if (!ref || ref === host) {
    return "sb-auth-token";
  }
  return `sb-${ref}-auth-token`;
}

export function isValidAuthUser(
  user: User | null | undefined
): user is User {
  return typeof user?.id === "string" && UUID_RE.test(user.id);
}

export function isAuthSessionError(
  error: { message?: string; status?: number; code?: string } | null | undefined
): boolean {
  if (!error) {
    return false;
  }
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();

  if (error.status === 401 || error.status === 403) {
    return true;
  }

  return (
    code === "session_not_found" ||
    code === "user_not_found" ||
    msg.includes("invalid refresh token") ||
    msg.includes("refresh token not found") ||
    msg.includes("session not found") ||
    msg.includes("user not found") ||
    msg.includes("jwt expired") ||
    msg.includes("token is expired") ||
    msg.includes("not authenticated") ||
    (msg.includes("jwt") && msg.includes("invalid"))
  );
}

export function shouldInvalidateForHttpStatus(status: number): boolean {
  return status === 401;
}

export async function bootstrapValidatedAuthSession(
  deps: AuthSessionDeps
): Promise<AuthBootstrapResult> {
  const { data: sessionData, error: sessionError } =
    await deps.client.auth.getSession();

  if (sessionError && isAuthSessionError(sessionError)) {
    await deps.signOutLocal("local");
    await deps.clearStorage();
    deps.clearCaches();
    return { session: null, user: null, loginRequired: true };
  }

  const storedSession = sessionData.session;
  if (!storedSession) {
    return { session: null, user: null, loginRequired: false };
  }

  const { data: userData, error: userError } = await deps.client.auth.getUser();

  if (userError || !isValidAuthUser(userData.user)) {
    await deps.signOutLocal("local");
    await deps.clearStorage();
    deps.clearCaches();
    return { session: null, user: null, loginRequired: true };
  }

  return {
    session: storedSession,
    user: userData.user,
    loginRequired: false,
  };
}

export async function validateAuthUserFromServer(
  deps: AuthSessionDeps
): Promise<{ user: User | null; shouldInvalidate: boolean }> {
  const { data, error } = await deps.client.auth.getUser();
  if (error || !isValidAuthUser(data.user)) {
    return { user: null, shouldInvalidate: true };
  }
  return { user: data.user, shouldInvalidate: false };
}
