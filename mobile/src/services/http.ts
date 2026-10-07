/**
 * Instância HTTP da API da DÉCADA.
 *
 * Tudo que é política de comunicação mora aqui, em interceptors: o token entra
 * num lugar só e qualquer falha sai como `ApiError`. Assim uma chamada nova em
 * `api.ts` já nasce autenticada e com erro tratado, sem repetir código — e a
 * tela nunca precisa saber que existe axios do outro lado.
 */

import axios from 'axios';

import { API_URL } from './config';
import { readToken } from './session';

/** Rede ruim não pode travar a tela para sempre. */
const TEMPO_LIMITE = 15_000;

const MENSAGEM_DE_REDE = 'não foi possível falar com o servidor';
const MENSAGEM_DO_SERVIDOR = 'erro inesperado no servidor';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Requisição que ainda não tem token: login e cadastro. */
    anonymous?: boolean;
    /** Mensagem quando o servidor não responde. O envio do PDF tem a sua. */
    networkMessage?: string;
    /** Mensagem quando o erro do servidor vem sem `detail` legível. */
    fallbackMessage?: string;
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sessão expirada, token adulterado ou conta excluída. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Mensagem legível a partir do corpo de erro da API. */
function readDetail(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Erro de validação do Pydantic: lista de problemas por campo.
    if (Array.isArray(detail) && detail.length > 0) {
      const primeiro = detail[0] as { msg?: string };
      if (primeiro?.msg) return primeiro.msg;
    }
  }
  return fallback;
}

export const http = axios.create({
  baseURL: API_URL,
  timeout: TEMPO_LIMITE,
});

/** Token em toda requisição que não seja login ou cadastro. */
http.interceptors.request.use(async (config) => {
  if (config.anonymous) return config;

  const token = await readToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);

  return config;
});

/**
 * Toda falha vira `ApiError`.
 *
 * Falha de rede e tempo esgotado não têm status HTTP; `0` marca esse caso, e é
 * por ele que a tela distingue "servidor recusou" de "servidor não respondeu".
 */
http.interceptors.response.use(
  (resposta) => resposta,
  (problema: unknown) => {
    if (!axios.isAxiosError(problema)) throw problema;

    const { config, response } = problema;

    if (!response) {
      throw new ApiError(0, config?.networkMessage ?? MENSAGEM_DE_REDE);
    }

    throw new ApiError(
      response.status,
      readDetail(response.data, config?.fallbackMessage ?? MENSAGEM_DO_SERVIDOR),
    );
  },
);
