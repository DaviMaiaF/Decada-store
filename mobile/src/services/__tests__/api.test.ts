/**
 * Testes do cliente HTTP.
 *
 * O que importa aqui é o contrato com o backend: token no cabeçalho, mensagem
 * de erro legível e 401 reconhecível — é ele que derruba a sessão.
 */

import * as api from '../api';
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

describe('envio do PDF', () => {
  /**
   * O formato do arquivo no FormData é diferente entre web e nativo. Errar isso
   * fazia o servidor receber a string "[object Object]" e recusar o envio com
   * "Expected UploadFile, received: str".
   */
  function capturarFormData() {
    const enviado: { campo: string; valor: unknown; nome?: string }[] = [];
    const fetchFalso = jest.fn((_url: string, opcoes: RequestInit) => {
      const form = opcoes.body as unknown as {
        append: unknown;
        _entradas?: typeof enviado;
      };
      enviado.push(...((form as { _entradas?: typeof enviado })._entradas ?? []));
      return respostaFalsa(201, { meal_plan: { id: 'plano' } });
    });
    return { enviado, fetchFalso };
  }

  beforeEach(() => {
    // FormData do jsdom não expõe o que foi anexado; este substituto expõe.
    class FormDataFalso {
      _entradas: { campo: string; valor: unknown; nome?: string }[] = [];
      append(campo: string, valor: unknown, nome?: string) {
        this._entradas.push({ campo, valor, nome });
      }
    }
    global.FormData = FormDataFalso as unknown as typeof FormData;
  });

  it('no nativo manda o descritor de arquivo do React Native', async () => {
    const { enviado, fetchFalso } = capturarFormData();
    global.fetch = fetchFalso as unknown as typeof fetch;

    await api.importMealPlan(
      { uri: 'file:///plano.pdf', name: 'plano.pdf', mimeType: 'application/pdf' },
      true,
    );

    const arquivo = enviado.find((e) => e.campo === 'file');
    expect(arquivo?.valor).toEqual({
      uri: 'file:///plano.pdf',
      name: 'plano.pdf',
      type: 'application/pdf',
    });
  });

  it('manda o aceite do termo junto', async () => {
    const { enviado, fetchFalso } = capturarFormData();
    global.fetch = fetchFalso as unknown as typeof fetch;

    await api.importMealPlan({ uri: 'file:///p.pdf', name: 'p.pdf' }, true);

    expect(enviado.find((e) => e.campo === 'consent_accepted')?.valor).toBe('true');
  });
});
