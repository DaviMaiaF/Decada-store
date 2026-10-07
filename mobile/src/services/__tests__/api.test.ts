/**
 * Testes do cliente HTTP.
 *
 * O que importa aqui é o contrato com o backend: token no cabeçalho, corpo em
 * JSON, mensagem de erro legível e 401 reconhecível — é ele que derruba a
 * sessão. A rede é substituída pelo adaptador do axios, que é o ponto onde a
 * requisição sairia para valer.
 */

import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import * as api from '../api';
import { ApiError, login, readPantry, removePantryItem } from '../api';
import { API_URL } from '../config';
import { http } from '../http';
import { saveToken } from '../session';

jest.mock('../session', () => ({
  readToken: jest.fn(),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

const { readToken } = jest.requireMock('../session');

type Adaptador = jest.Mock<ReturnType<AxiosAdapter>, [InternalAxiosRequestConfig]>;

/** Responde no lugar do servidor e devolve o espião do que foi enviado. */
function responder(status: number, corpo: unknown): Adaptador {
  const adaptador: Adaptador = jest.fn((config: InternalAxiosRequestConfig) => {
    const resposta = {
      data: corpo,
      status,
      statusText: '',
      headers: new AxiosHeaders(),
      config,
    } as AxiosResponse;

    if (status >= 200 && status < 300) return Promise.resolve(resposta);

    // Status de erro é recusado aqui: no axios, é o adaptador que decide isso.
    return Promise.reject(
      new AxiosError('a requisição falhou', 'ERR_BAD_RESPONSE', config, null, resposta),
    );
  });

  http.defaults.adapter = adaptador as unknown as AxiosAdapter;
  return adaptador;
}

/** Servidor fora do ar: erro sem resposta nenhuma. */
function naoResponder(): Adaptador {
  const adaptador: Adaptador = jest.fn((config: InternalAxiosRequestConfig) =>
    Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config)),
  );

  http.defaults.adapter = adaptador as unknown as AxiosAdapter;
  return adaptador;
}

beforeEach(() => {
  jest.clearAllMocks();
  readToken.mockResolvedValue('token-de-teste');
});

describe('autenticação da requisição', () => {
  it('manda o token no cabeçalho', async () => {
    const adaptador = responder(200, []);

    await readPantry();

    const [config] = adaptador.mock.calls[0];
    expect(config.headers.get('Authorization')).toBe('Bearer token-de-teste');
  });

  it('não manda token no login', async () => {
    const adaptador = responder(200, { access_token: 'x' });

    await login('marina@example.com', 'senha');

    const [config] = adaptador.mock.calls[0];
    expect(config.headers.get('Authorization')).toBeUndefined();
    expect(saveToken).not.toHaveBeenCalled();
  });

  it('não quebra quando ainda não há token guardado', async () => {
    readToken.mockResolvedValue(null);
    responder(200, []);

    await expect(readPantry()).resolves.toEqual([]);
  });
});

describe('montagem da requisição', () => {
  it('resolve o caminho contra o endereço da API', async () => {
    const adaptador = responder(200, []);

    await readPantry();

    const [config] = adaptador.mock.calls[0];
    expect(config.baseURL).toBe(API_URL);
    expect(config.url).toBe('/pantry');
  });

  it('manda o corpo como JSON', async () => {
    const adaptador = responder(200, { access_token: 'x' });

    await login('marina@example.com', 'senha');

    const [config] = adaptador.mock.calls[0];
    expect(config.headers.get('Content-Type')).toContain('application/json');
    expect(JSON.parse(config.data as string)).toEqual({
      email: 'marina@example.com',
      password: 'senha',
    });
  });

  it('desiste depois do tempo limite em vez de travar a tela', () => {
    expect(http.defaults.timeout).toBeGreaterThan(0);
  });
});

describe('erros', () => {
  it('reconhece o 401 para a sessão poder cair', async () => {
    responder(401, { detail: 'credenciais inválidas' });

    const erro = await readPantry().catch((problema) => problema);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).isUnauthorized).toBe(true);
  });

  it('usa a mensagem que o servidor mandou', async () => {
    responder(422, { detail: 'o PDF não tem texto selecionável' });

    await expect(readPantry()).rejects.toThrow('o PDF não tem texto selecionável');
  });

  it('extrai a mensagem do erro de validação do Pydantic', async () => {
    responder(422, { detail: [{ msg: 'value is not a valid email address' }] });

    await expect(readPantry()).rejects.toThrow('value is not a valid email address');
  });

  it('falha de rede vira erro com status zero', async () => {
    naoResponder();

    const erro = await readPantry().catch((problema) => problema);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).status).toBe(0);
    expect((erro as ApiError).message).toContain('servidor');
  });

  it('erro sem detail legível ainda vira ApiError', async () => {
    responder(500, '<html>erro do proxy</html>');

    const erro = await readPantry().catch((problema) => problema);

    expect((erro as ApiError).status).toBe(500);
    expect((erro as ApiError).message).toBe('erro inesperado no servidor');
  });
});

describe('resposta sem corpo', () => {
  it('aceita o 204 do DELETE', async () => {
    responder(204, '');

    await expect(removePantryItem('id-qualquer')).resolves.toBeUndefined();
  });
});

describe('envio do PDF', () => {
  /**
   * O formato do arquivo no FormData é diferente entre web e nativo. Errar isso
   * fazia o servidor receber a string "[object Object]" e recusar o envio com
   * "Expected UploadFile, received: str".
   */
  interface Entrada {
    campo: string;
    valor: unknown;
    nome?: string;
  }

  function capturarFormData() {
    const adaptador = responder(201, { meal_plan: { id: 'plano' } });
    const enviado = () => {
      const form = adaptador.mock.calls[0][0].data as unknown as { _entradas: Entrada[] };
      return form._entradas;
    };
    return { enviado, adaptador };
  }

  beforeEach(() => {
    // FormData do jsdom não expõe o que foi anexado; este substituto expõe.
    class FormDataFalso {
      _entradas: Entrada[] = [];

      /**
       * O axios guarda o construtor real de FormData quando é carregado, então
       * não reconhece este substituto por `instanceof`. Sem esta etiqueta ele
       * trataria o formulário como objeto comum e mandaria o PDF em JSON.
       */
      get [Symbol.toStringTag]() {
        return 'FormData';
      }

      append(campo: string, valor: unknown, nome?: string) {
        this._entradas.push({ campo, valor, nome });
      }
    }
    global.FormData = FormDataFalso as unknown as typeof FormData;
  });

  it('no nativo manda o descritor de arquivo do React Native', async () => {
    const { enviado } = capturarFormData();

    await api.importMealPlan(
      { uri: 'file:///plano.pdf', name: 'plano.pdf', mimeType: 'application/pdf' },
      true,
    );

    const arquivo = enviado().find((entrada) => entrada.campo === 'file');
    expect(arquivo?.valor).toEqual({
      uri: 'file:///plano.pdf',
      name: 'plano.pdf',
      type: 'application/pdf',
    });
  });

  it('manda o aceite do termo junto', async () => {
    const { enviado } = capturarFormData();

    await api.importMealPlan({ uri: 'file:///p.pdf', name: 'p.pdf' }, true);

    expect(enviado().find((entrada) => entrada.campo === 'consent_accepted')?.valor).toBe('true');
  });

  it('o PDF também leva o token, pelo interceptor', async () => {
    const { adaptador } = capturarFormData();

    await api.importMealPlan({ uri: 'file:///p.pdf', name: 'p.pdf' }, true);

    expect(adaptador.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer token-de-teste');
  });
});
