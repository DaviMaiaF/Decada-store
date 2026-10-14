/**
 * Endereço da API.
 *
 * `localhost` não serve: no emulador Android e no celular físico ele aponta
 * para o próprio aparelho, não para a máquina que roda o backend. Por isso o
 * endereço vem de `EXPO_PUBLIC_API_URL`, definido em `mobile/.env`.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

/**
 * Só em desenvolvimento: com `EXPO_PUBLIC_RESET_SESSION=1`, o app apaga o token
 * guardado ao abrir e cai no login. Não mexe no banco — só na sessão do aparelho.
 */
export const RESET_SESSION =
  __DEV__ && process.env.EXPO_PUBLIC_RESET_SESSION === '1';
