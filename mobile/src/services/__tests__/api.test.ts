/**
 * Testes do cliente HTTP.
 *
 * O que importa aqui é o contrato com o backend: token no cabeçalho, mensagem
 * de erro legível e 401 reconhecível — é ele que derruba a sessão.
 */

import { ApiError, login, readPantry, removePantryItem } from '../api';
import { saveToken } from '../session';

jest.mock('../session', () => ({
  readToken: jest.fn(),
  saveToken: jest.fn(),
  clearToken: jest.fn(),
}));

const { readToken } = jest.requireMock('../session');

function respostaFalsa(status: number, corpo: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(corpo === null ? '' : JSON.stringify(corpo)),
  } as Response);
}

beforeEach(() => {
  jest.clearAllMocks();
  readToken.mockResolvedValue('token-de-teste');
});

describe('autenticação da requisição', () => {
  it('manda o token no cabeçalho', async () => {
    const fetchFalso = jest.fn(() => respostaFalsa(200, []));
    global.fetch = fetchFalso as unknown as typeof fetch;

    await readPantry();

    const [, opcoes] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect((opcoes.headers as Record<string, string>).Authorization).toBe(
      'Bearer token-de-teste',
    );
  });

  it('não manda token no login', async () => {
    const fetchFalso = jest.fn(() => respostaFalsa(200, { access_token: 'x' }));
    global.fetch = fetchFalso as unknown as typeof fetch;

    await login('marina@example.com', 'senha');

    const [, opcoes] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect((opcoes.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(saveToken).not.toHaveBeenCalled();
  });

  it('não quebra quando ainda não há token guardado', async () => {
    readToken.mockResolvedValue(null);
    const fetchFalso = jest.fn(() => respostaFalsa(200, []));
    global.fetch = fetchFalso as unknown as typeof fetch;

    await expect(readPantry()).resolves.toEqual([]);
  });
});

describe('erros', () => {
  it('reconhece o 401 para a sessão poder cair', async () => {
    global.fetch = jest.fn(() =>
      respostaFalsa(401, { detail: 'credenciais inválidas' }),
    ) as unknown as typeof fetch;

    const erro = await readPantry().catch((problema) => problema);

    expect(erro).toBeInstanceOf(ApiError);
    expect((erro as ApiError).isUnauthorized).toBe(true);
  });

  it('usa a mensagem que o servidor mandou', async () => {
    global.fetch = jest.fn(() =>
      respostaFalsa(422, { detail: 'o PDF não tem texto selecionável' }),
    ) as unknown as typeof fetch;

    await expect(readPantry()).rejects.toThrow('o PDF não tem texto selecionável');
  });

  it('extrai a mensagem do erro de validação do Pydantic', async () => {
    global.fetch = jest.fn(() =>
      respostaFalsa(422, { detail: [{ msg: 'value is not a valid email address' }] }),
    ) as unknown as typeof fetch;

    await expect(readPantry()).rejects.toThrow('value is not a valid email address');
  });

  it('falha de rede vira erro com status zero', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;

    const erro = await readPantry().catch((problema) => problema);

    expect((erro as ApiError).status).toBe(0);
    expect((erro as ApiError).message).toContain('servidor');
  });
});

describe('resposta sem corpo', () => {
  it('aceita o 204 do DELETE', async () => {
    global.fetch = jest.fn(() => respostaFalsa(204, null)) as unknown as typeof fetch;

    await expect(removePantryItem('id-qualquer')).resolves.toBeUndefined();
  });
});
