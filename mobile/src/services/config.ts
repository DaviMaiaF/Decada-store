/**
 * Endereço da API.
 *
 * `localhost` não serve: no emulador Android e no celular físico ele aponta
 * para o próprio aparelho, não para a máquina que roda o backend. Por isso o
 * endereço vem de `EXPO_PUBLIC_API_URL`, definido em `mobile/.env`.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
