/**
 * Guarda o token de acesso e as preferências de sessão do usuário.
 *
 * `expo-secure-store` usa Keychain no iOS e Keystore no Android — armazenamento
 * cifrado pelo sistema. Não é AsyncStorage de propósito: lá o token ficaria em
 * texto puro no disco, e este token dá acesso a plano alimentar, que é dado
 * sensível de saúde.
 *
 * Na web o SecureStore não existe; o fallback é localStorage, aceitável porque
 * a versão web serve só para desenvolvimento.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { UserRole } from '../types/api';

const CHAVE_TOKEN = 'decada.access_token';
const CHAVE_REGIAO = 'decada.user_region';
const CHAVE_PAPEL = 'decada.user_role';
const CHAVE_LEMBRAR = 'decada.remember_me';

export interface UserRegion {
  stateCode: string;
  city: string;
}

export const REGIAO_PADRAO: UserRegion = {
  stateCode: 'DF',
  city: 'Brasília',
};

// --- token de autenticação ---

/**
 * O token da sessão em curso. Sem "lembrar de mim" ele mora só aqui e nunca
 * chega ao disco (decisão 5, minimização): fechar o app encerra a sessão.
 */
let tokenEmMemoria: string | null = null;

async function gravar(chave: string, valor: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(chave, valor);
    return;
  }
  await SecureStore.setItemAsync(chave, valor);
}

async function apagar(chave: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(chave);
    return;
  }
  await SecureStore.deleteItemAsync(chave);
}

/**
 * Guarda o token. Com `lembrar`, ele vai para o armazenamento seguro junto com
 * a preferência, e a próxima abertura restaura a sessão. Sem, fica só em
 * memória — e o que um login antigo tiver deixado no disco é apagado.
 */
export async function saveToken(token: string, lembrar: boolean): Promise<void> {
  tokenEmMemoria = token;
  if (lembrar) {
    await gravar(CHAVE_TOKEN, token);
    await gravar(CHAVE_LEMBRAR, '1');
    return;
  }
  await apagar(CHAVE_TOKEN);
  await apagar(CHAVE_PAPEL);
  await apagar(CHAVE_LEMBRAR);
}

export async function readToken(): Promise<string | null> {
  if (tokenEmMemoria !== null) return tokenEmMemoria;
  if (Platform.OS === 'web') {
    return localStorage.getItem(CHAVE_TOKEN);
  }
  return SecureStore.getItemAsync(CHAVE_TOKEN);
}

/** Se a pessoa marcou "lembrar de mim" no último login. Sem marca, não lembra. */
export async function readRememberMe(): Promise<boolean> {
  const valor =
    Platform.OS === 'web'
      ? localStorage.getItem(CHAVE_LEMBRAR)
      : await SecureStore.getItemAsync(CHAVE_LEMBRAR);
  return valor === '1';
}

/** Sai da sessão: o papel e a preferência vão juntos, porque só valem com o token. */
export async function clearToken(): Promise<void> {
  tokenEmMemoria = null;
  await apagar(CHAVE_TOKEN);
  await apagar(CHAVE_PAPEL);
  await apagar(CHAVE_LEMBRAR);
}

// --- papel da conta ---

/**
 * O papel fica guardado para o app abrir na navegação certa mesmo sem rede,
 * quando `/auth/me` não responde. Não decide permissão nenhuma: quem decide é
 * o servidor, que responde 404 à rota do outro papel.
 */
export async function saveRole(role: UserRole): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(CHAVE_PAPEL, role);
    return;
  }
  await SecureStore.setItemAsync(CHAVE_PAPEL, role);
}

/** Sessão de antes da conta de nutricionista não tem papel guardado: era paciente. */
export async function readRole(): Promise<UserRole> {
  const valor =
    Platform.OS === 'web'
      ? localStorage.getItem(CHAVE_PAPEL)
      : await SecureStore.getItemAsync(CHAVE_PAPEL);
  return valor === 'nutricionista' ? 'nutricionista' : 'paciente';
}

// --- região do usuário (estado e cidade) ---

export async function saveRegion(region: UserRegion): Promise<void> {
  const valor = JSON.stringify(region);
  if (Platform.OS === 'web') {
    localStorage.setItem(CHAVE_REGIAO, valor);
    return;
  }
  await SecureStore.setItemAsync(CHAVE_REGIAO, valor);
}

export async function readRegion(): Promise<UserRegion> {
  let bruto: string | null = null;
  if (Platform.OS === 'web') {
    bruto = localStorage.getItem(CHAVE_REGIAO);
  } else {
    bruto = await SecureStore.getItemAsync(CHAVE_REGIAO);
  }

  if (!bruto) return REGIAO_PADRAO;

  try {
    const dados = JSON.parse(bruto) as UserRegion;
    if (dados.stateCode && dados.city) {
      return dados;
    }
  } catch {
    // Caso o dado esteja corrompido, retorna o padrão
  }
  return REGIAO_PADRAO;
}
