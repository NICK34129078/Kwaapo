import type { AuthError, Session, User } from "@supabase/supabase-js";

export const LOGIN_INVALID_CREDENTIALS_MESSAGE =
  "E-mailadres of wachtwoord is onjuist.";

export type SignInWithPasswordFn = (
  credentials: { email: string; password: string }
) => Promise<{
  data: { user: User | null; session: Session | null };
  error: AuthError | null;
}>;

export type SignUpFn = (
  credentials: { email: string; password: string; options?: { data?: Record<string, unknown> } }
) => Promise<{
  data: { user: User | null; session: Session | null };
  error: AuthError | null;
}>;

export type LoginAttemptResult =
  | { ok: true; user: User; session: Session }
  | { ok: false; message: string };

export type RegisterAttemptResult =
  | { ok: true; user: User; session: Session | null; needsEmailConfirmation: boolean }
  | { ok: false; message: string };

function isValidUserId(user: User | null | undefined): boolean {
  return (
    typeof user?.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)
  );
}

/**
 * Login: uitsluitend signInWithPassword. Roept nooit signUp aan.
 */
export async function performLoginAttempt(
  email: string,
  password: string,
  signInWithPassword: SignInWithPasswordFn
): Promise<LoginAttemptResult> {
  const trimmedEmail = email.trim();
  const { data, error } = await signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error || !isValidUserId(data.user) || data.session == null) {
    return {
      ok: false,
      message: LOGIN_INVALID_CREDENTIALS_MESSAGE,
    };
  }

  return {
    ok: true,
    user: data.user,
    session: data.session,
  };
}

/**
 * Registratie: uitsluitend signUp. Alleen via expliciete register-handler aanroepen.
 */
export async function performRegisterAttempt(
  input: {
    email: string;
    password: string;
    username?: string;
  },
  signUp: SignUpFn
): Promise<RegisterAttemptResult> {
  const trimmedEmail = input.email.trim();
  const options =
    input.username != null && input.username.length > 0
      ? { data: { username: input.username } }
      : undefined;

  const { data, error } = await signUp({
    email: trimmedEmail,
    password: input.password,
    options,
  });

  if (error || !isValidUserId(data.user)) {
    return {
      ok: false,
      message: error?.message ?? "Registratie mislukt.",
    };
  }

  return {
    ok: true,
    user: data.user,
    session: data.session,
    needsEmailConfirmation: data.session == null,
  };
}

/** Test-helper: bewijs dat loginflow signUp nooit aanroept. */
export function createTrackedSignIn(
  impl: SignInWithPasswordFn
): SignInWithPasswordFn & { signUpCalled: boolean } {
  const tracked = async (credentials: {
    email: string;
    password: string;
  }) => {
    return impl(credentials);
  };
  (tracked as SignInWithPasswordFn & { signUpCalled: boolean }).signUpCalled = false;
  return tracked as SignInWithPasswordFn & { signUpCalled: boolean };
}

export function createSignUpSpy(): {
  signUp: SignUpFn;
  callCount: number;
} {
  let callCount = 0;
  const signUp: SignUpFn = async () => {
    callCount += 1;
    return {
      data: { user: null, session: null },
      error: { message: "signUp should not be called", name: "AuthError", status: 400 } as AuthError,
    };
  };
  return {
    signUp,
    get callCount() {
      return callCount;
    },
  };
}
