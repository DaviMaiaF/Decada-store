/**
 * Sessão do usuário: quem está logado e como entrar ou sair.
 *
 * O token vive no armazenamento seguro; este contexto guarda só se existe uma
 * sessão válida, para a navegação saber qual pilha mostrar.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as api from './api';
import { resetSessionAtivo } from './config';
import { onSessionExpired } from './http';
import { clearToken, readToken, saveToken } from './session';

interface AuthValue {
  /** Nulo enquanto o app ainda não leu o armazenamento seguro. */
  signedIn: boolean | null;
  /** Aviso para a tela de login, quando a sessão caiu sozinha. */
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Qualquer chamada que volte 401 derruba a sessão e leva ao login.
    return onSessionExpired(() => {
      setNotice('sua sessão expirou, entre de novo');
      setSignedIn(false);
    });
  }, []);

  useEffect(() => {
    // Na abertura, a sessão guardada decide se cai no login ou no app. Ter um
    // token não basta: ele pode ter vencido, ou a conta pode ter sido excluída.
    let ativo = true;
    (async () => {
      // Só em desenvolvimento (RESET_SESSION=1): começa sempre deslogado.
      if (resetSessionAtivo()) await clearToken();
      const token = await readToken();
      if (token === null) {
        if (ativo) setSignedIn(false);
        return;
      }
      try {
        await api.readAccount();
        if (ativo) setSignedIn(true);
      } catch (problema) {
        // 401: o interceptor já limpou o token e avisou. Qualquer outra falha
        // (rede fora, servidor desligado) não prova que a sessão caiu, e
        // deslogar quem só está sem internet seria pior.
        const caiu = problema instanceof api.ApiError && problema.isUnauthorized;
        if (ativo) setSignedIn(!caiu);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { access_token } = await api.login(email, password);
    await saveToken(access_token);
    setNotice(null);
    setSignedIn(true);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const { access_token } = await api.register(email, password, fullName);
    await saveToken(access_token);
    setNotice(null);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setNotice(null);
    setSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ signedIn, notice, signIn, signUp, signOut }),
    [signedIn, notice, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return value;
}
