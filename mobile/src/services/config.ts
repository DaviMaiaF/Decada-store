/**
 * Endereço da API.
 *
 * `localhost` não serve fora do navegador: no emulador Android e no celular
 * físico ele aponta para o próprio aparelho, não para a máquina que roda o
 * backend. A ordem de decisão é:
 *
 * 1. `EXPO_PUBLIC_API_URL`, se definida em `mobile/.env`;
 * 2. o IP do computador de desenvolvimento, que o Expo já conhece (é o host de
 *    onde o app foi carregado) — funciona em Windows, macOS e Linux;
 * 3. `10.0.2.2` no emulador Android, que é como ele enxerga a máquina hospedeira;
 * 4. `localhost`.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

const PORTA_DA_API = 8000;

interface Ambiente {
  explicit?: string;
  /** `host:porta` do servidor Metro, como em `192.168.0.5:8081`. */
  hostUri?: string | null;
  os: string;
}

/** Tira o `:porta` de um `host:porta`, preservando IPv6 entre colchetes. */
function hostSemPorta(hostUri: string): string {
  const semEsquema = hostUri.replace(/^[a-z]+:\/\//i, '').split('/')[0];
  if (semEsquema.startsWith('[')) return semEsquema.slice(0, semEsquema.indexOf(']') + 1);
  return semEsquema.split(':')[0];
}

export function resolveApiUrl({ explicit, hostUri, os }: Ambiente): string {
  if (explicit && explicit.trim()) return explicit.trim().replace(/\/+$/, '');

  const host = hostUri ? hostSemPorta(hostUri) : '';
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${PORTA_DA_API}`;
  }

  if (os === 'android') return `http://10.0.2.2:${PORTA_DA_API}`;
  return `http://localhost:${PORTA_DA_API}`;
}

export const API_URL = resolveApiUrl({
  explicit: process.env.EXPO_PUBLIC_API_URL,
  hostUri: Constants.expoConfig?.hostUri,
  os: Platform.OS,
});

/**
 * Só em desenvolvimento: com `EXPO_PUBLIC_RESET_SESSION=1`, o app apaga o token
 * guardado ao abrir e cai no login. Não mexe no banco — só na sessão do aparelho.
 */
export function resetSessionAtivo(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_RESET_SESSION === '1';
}
