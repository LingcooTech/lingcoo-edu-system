import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import {
  fetchParentProfile,
  parentLogin,
  parentLogout,
  parentRegister,
  type AuthAccount,
} from '@/api/client';

type AuthMode = 'login' | 'register';

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}

interface SessionContextValue {
  account: AuthAccount | null;
  loading: boolean;
  authOpen: boolean;
  authMode: AuthMode;
  openAuth: (mode?: AuthMode) => void;
  closeAuth: () => void;
  login: (identifier: string, password: string) => Promise<AuthAccount>;
  register: (input: RegisterInput) => Promise<AuthAccount>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Single source of front-of-house auth state: the current account, the login /
 * register modal, and the post-login "欢迎您回来" toast. Mirrors FD-retail's
 * `useShop()` ergonomics but stays dependency-free (plain React context).
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [welcome, setWelcome] = useState<string | null>(null);
  const welcomeTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setAccount(await fetchParentProfile());
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const showWelcome = useCallback((name: string) => {
    setWelcome(`${name}，欢迎您回来`);
    if (welcomeTimer.current) {
      window.clearTimeout(welcomeTimer.current);
    }
    welcomeTimer.current = window.setTimeout(() => setWelcome(null), 3200);
  }, []);

  useEffect(
    () => () => {
      if (welcomeTimer.current) {
        window.clearTimeout(welcomeTimer.current);
      }
    },
    [],
  );

  const openAuth = useCallback((mode: AuthMode = 'login') => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const { account: next } = await parentLogin(identifier, password);
      setAccount(next);
      setAuthOpen(false);
      showWelcome(next.displayName);
      return next;
    },
    [showWelcome],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const { account: next } = await parentRegister(input);
      setAccount(next);
      setAuthOpen(false);
      showWelcome(next.displayName);
      return next;
    },
    [showWelcome],
  );

  const logout = useCallback(async () => {
    await parentLogout();
    setAccount(null);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      account,
      loading,
      authOpen,
      authMode,
      openAuth,
      closeAuth,
      login,
      register,
      logout,
      refresh,
    }),
    [account, loading, authOpen, authMode, openAuth, closeAuth, login, register, logout, refresh],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
      {welcome ? (
        <div
          className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4"
          role="status"
          aria-live="polite"
        >
          <div className="bg-ink rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-lg">
            {welcome}
          </div>
        </div>
      ) : null}
    </SessionContext.Provider>
  );
}
