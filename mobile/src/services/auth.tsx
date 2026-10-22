/**
 * Sessão do usuário: quem está logado, com qual papel, e como entrar ou sair.
 *
 * O token vive em `session.ts` — em memória, e no armazenamento seguro só se a
 * pessoa marcou "lembrar de mim"; este contexto guarda só se existe uma
 * sessão válida e de que papel ela é, para a raiz saber qual navegação mostrar:
 * a do paciente, com as quatro abas, ou a da nutricionista, com as receitas.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import * as api from './api';
import { resetSessionAtivo } from './config';
import { onSessionExpired } from './http';
import {
  clearToken,
  readRememberMe,
  readRole,
  readToken,
  saveRole,
  saveToken,
} from './session';
import type { Token, UserRole } from '../types/api';

interface AuthValue {
  /** Nulo enquanto o app ainda não leu o armazenamento seguro. */
  signedIn: boolean | null;
  /** Papel da conta logada. Nulo sem sessão. */
  role: UserRole | null;
  /** Aviso para a tela de login, quando a sessão caiu sozinha. */
  notice: string | null;
  /** `lembrar` grava o token no aparelho; sem ele, fechar o app encerra a sessão. */
  signIn: (
    email: string,
    password: string,
    role?: UserRole,
    lembrar?: boolean,
  ) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
    lembrar?: boolean,
  ) => Promise<void>;
  signUpNutritionist: (
    email: string,
    password: string,
    fullName: string,
    crn: string,
    lembrar?: boolean,
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Qualquer chamada que volte 401 derruba a sessão e leva ao login.
    return onSessionExpired(() => {
      setNotice('sua sessão expirou, entre de novo');
      setSignedIn(false);
      setRole(null);
    });
  }, []);

  useEffect(() => {
    // Na abertura, a sessão guardada decide se cai no login ou no app. Ter um
    // token não basta: ele pode ter vencido, ou a conta pode ter sido excluída.
    let ativo = true;
    (async () => {
      // Sem "lembrar de mim", a abertura cai sempre no login. Apagar aqui também
      // limpa o token de quem entrou antes de a opção existir. Em desenvolvimento,
      // RESET_SESSION=1 faz o mesmo mesmo com a opção marcada.
      if (resetSessionAtivo() || !(await readRememberMe())) await clearToken();
      const token = await readToken();
      if (token === null) {
        if (ativo) setSignedIn(false);
        return;
      }
      try {
        const conta = await api.readAccount();
        if (ativo) {
          setRole(conta.role);
          setSignedIn(true);
        }
      } catch (problema) {
        // 401: o interceptor já limpou o token e avisou. Qualquer outra falha
        // (rede fora, servidor desligado) não prova que a sessão caiu, e
        // deslogar quem só está sem internet seria pior. O papel vem do que
        // ficou guardado no último login.
        const caiu = problema instanceof api.ApiError && problema.isUnauthorized;
        const guardado = caiu ? null : await readRole();
        if (ativo) {
          setRole(guardado);
          setSignedIn(!caiu);
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  const entrar = useCallback(async (token: Token, lembrar: boolean) => {
    await saveToken(token.access_token, lembrar);
    // O papel guardado só serve para abrir a sessão lembrada sem rede.
    if (lembrar) await saveRole(token.role);
    setNotice(null);
    setRole(token.role);
    setSignedIn(true);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, papel: UserRole = 'paciente', lembrar = false) => {
      const porta = papel === 'nutricionista' ? api.loginNutritionist : api.login;
      await entrar(await porta(email, password), lembrar);
    },
    [entrar],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName?: string, lembrar = false) => {
      await entrar(await api.register(email, password, fullName), lembrar);
    },
    [entrar],
  );

  const signUpNutritionist = useCallback(
    async (email: string, password: string, fullName: string, crn: string, lembrar = false) => {
      await entrar(await api.registerNutritionist(email, password, fullName, crn), lembrar);
    },
    [entrar],
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setNotice(null);
    setRole(null);
    setSignedIn(false);
  }, []);

  const value = useMemo(
    () => ({ signedIn, role, notice, signIn, signUp, signUpNutritionist, signOut }),
    [signedIn, role, notice, signIn, signUp, signUpNutritionist, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return value;
}
