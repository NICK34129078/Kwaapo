import test from "node:test";
import assert from "node:assert/strict";
import type { Session, User } from "@supabase/supabase-js";

import {
  LOGIN_INVALID_CREDENTIALS_MESSAGE,
  performLoginAttempt,
  performRegisterAttempt,
  type SignInWithPasswordFn,
  type SignUpFn,
} from "./authLoginFlow";

const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function makeUser(): User {
  return {
    id: USER_ID,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as User;
}

function makeSession(user: User): Session {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    token_type: "bearer",
    user,
  } as Session;
}

test("deleted account + old password → foutmelding, signUp niet aangeroepen", async () => {
  let signUpCalls = 0;
  const signInWithPassword: SignInWithPasswordFn = async () => ({
    data: { user: null, session: null },
    error: {
      message: "Invalid login credentials",
      name: "AuthError",
      status: 400,
      code: "invalid_credentials",
    } as any,
  });
  const signUp: SignUpFn = async () => {
    signUpCalls += 1;
    return { data: { user: makeUser(), session: makeSession(makeUser()) }, error: null };
  };

  const result = await performLoginAttempt(
    "n.vandullemen@gmail.com",
    "old-password",
    signInWithPassword
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, LOGIN_INVALID_CREDENTIALS_MESSAGE);
  }
  assert.equal(signUpCalls, 0);
});

test("niet-bestaand e-mailadres → foutmelding, signUp niet aangeroepen", async () => {
  let signUpCalls = 0;
  const signInWithPassword: SignInWithPasswordFn = async () => ({
    data: { user: null, session: null },
    error: { message: "Invalid login credentials", name: "AuthError", status: 400 } as any,
  });
  const signUp: SignUpFn = async () => {
    signUpCalls += 1;
    return { data: { user: makeUser(), session: null }, error: null };
  };

  const result = await performLoginAttempt("new@example.com", "secret", signInWithPassword);
  assert.equal(result.ok, false);
  assert.equal(signUpCalls, 0);
});

test("verkeerd wachtwoord → geen nieuwe gebruiker", async () => {
  let signUpCalls = 0;
  const signInWithPassword: SignInWithPasswordFn = async () => ({
    data: { user: null, session: null },
    error: { message: "Invalid login credentials", name: "AuthError", status: 400 } as any,
  });
  const signUp: SignUpFn = async () => {
    signUpCalls += 1;
    return { data: { user: makeUser(), session: null }, error: null };
  };

  const result = await performLoginAttempt("user@example.com", "wrong", signInWithPassword);
  assert.equal(result.ok, false);
  assert.equal(signUpCalls, 0);
});

test("registreren → precies één signUp-call", async () => {
  let signUpCalls = 0;
  const signUp: SignUpFn = async () => {
    signUpCalls += 1;
    const user = makeUser();
    return { data: { user, session: makeSession(user) }, error: null };
  };

  const result = await performRegisterAttempt(
    { email: "new@example.com", password: "secret123", username: "nieuw" },
    signUp
  );

  assert.equal(result.ok, true);
  assert.equal(signUpCalls, 1);
});

test("loginhandler roept signUp nooit aan", async () => {
  let signInCalls = 0;
  let signUpCalls = 0;

  const signInWithPassword: SignInWithPasswordFn = async () => {
    signInCalls += 1;
    return {
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", name: "AuthError", status: 400 } as any,
    };
  };
  const signUp: SignUpFn = async () => {
    signUpCalls += 1;
    return { data: { user: makeUser(), session: null }, error: null };
  };

  await performLoginAttempt("user@example.com", "pw", signInWithPassword);

  assert.equal(signInCalls, 1);
  assert.equal(signUpCalls, 0);
});

test("succesvolle login vereist user én session", async () => {
  const user = makeUser();
  const signInWithPassword: SignInWithPasswordFn = async () => ({
    data: { user, session: makeSession(user) },
    error: null,
  });

  const result = await performLoginAttempt("user@example.com", "pw", signInWithPassword);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.user.id, USER_ID);
  }
});

test("login faalt zonder session ook al is user aanwezig", async () => {
  const signInWithPassword: SignInWithPasswordFn = async () => ({
    data: { user: makeUser(), session: null },
    error: null,
  });

  const result = await performLoginAttempt("user@example.com", "pw", signInWithPassword);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.message, LOGIN_INVALID_CREDENTIALS_MESSAGE);
  }
});
