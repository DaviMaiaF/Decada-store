/**
 * Sessão do usuário: quem está logado e como entrar ou sair.
 *
 * O token vive no armazenamento seguro; este contexto guarda só se existe uma
 * sessão válida, para a navegação saber qual pilha mostrar.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as api from './api';
import { clearToken, readToken, saveToken } from './session';

interface AuthValue {
  /** Nulo enquanto o app ainda não leu o armazenamento seguro. */
  signedIn: boolean | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    // Na abertura, a sessão guardada decide se cai no login ou no app.
    readToken().then((token) => setSignedIn(token !== null));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password);
    await saveToken(access_token);
    setSignedIn(true);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const { access_token } = await api.register(email, password, fullName);
    await saveToken(access_token);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ signedIn, signIn, signUp, signOut }),
    [signedIn, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return value;
}
