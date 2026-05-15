import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { LoginRegisterModal } from "../components/LoginRegisterModal";
import { useAuth } from "./AuthContext";

export type OpenAuthPromptOptions = {
  /** Korte uitleg waarom inloggen nodig is. */
  message?: string;
};

type AuthPromptContextValue = {
  openAuthPrompt: (options?: OpenAuthPromptOptions) => void;
  closeAuthPrompt: () => void;
};

const AuthPromptContext = createContext<AuthPromptContextValue | null>(null);

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const openAuthPrompt = useCallback((options?: OpenAuthPromptOptions) => {
    setMessage(options?.message);
    setVisible(true);
  }, []);

  const closeAuthPrompt = useCallback(() => {
    setVisible(false);
    setMessage(undefined);
  }, []);

  useEffect(() => {
    if (user != null && visible) {
      closeAuthPrompt();
    }
  }, [user, visible, closeAuthPrompt]);

  const value = useMemo(
    () => ({ openAuthPrompt, closeAuthPrompt }),
    [openAuthPrompt, closeAuthPrompt]
  );

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      <LoginRegisterModal
        visible={visible}
        onRequestClose={closeAuthPrompt}
        message={message}
      />
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt(): AuthPromptContextValue {
  const ctx = useContext(AuthPromptContext);
  if (!ctx) {
    throw new Error("useAuthPrompt must be used within AuthPromptProvider");
  }
  return ctx;
}
