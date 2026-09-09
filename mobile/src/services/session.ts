/**
 * Guarda o token de acesso.
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

const CHAVE = 'decada.access_token';

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(CHAVE, token);
    return;
  }
  await SecureStore.setItemAsync(CHAVE, token);
}

export async function readToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(CHAVE);
  }
  return SecureStore.getItemAsync(CHAVE);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(CHAVE);
    return;
  }
  await SecureStore.deleteItemAsync(CHAVE);
}
