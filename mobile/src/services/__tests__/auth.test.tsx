/** Testes da sessão: o que decide entre login e app na abertura. */

import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiError } from '../api';
import * as api from '../api';
import { AuthProvider, useAuth } from '../auth';
import { http } from '../http';

jest.mock('../session', () => ({
  readToken: jest.fn(),
  saveToken: jest.fn().mockResolvedValue(undefined),
  clearToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../api', () => ({
  ...jest.requireActual('../api'),
  readAccount: jest.fn(),
}));

const mockConfig = { reset: false };
jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  resetSessionAtivo: () => mockConfig.reset,
}));

const { readToken, clearToken } = jest.requireMock('../session');
const readAccountFalso = api.readAccount as jest.Mock;

function Estado() {
  const { signedIn, notice } = useAuth();
  return (
    <Text>
      {signedIn === null ? 'carregando' : signedIn ? 'logado' : 'deslogado'}
      {notice ? ` | ${notice}` : ''}
    </Text>
  );
}

async function montar() {
  await render(
    <AuthProvider>
      <Estado />
    </AuthProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.reset = false;
});

it('sem token, cai no login sem chamar a API', async () => {
  readToken.mockResolvedValue(null);
  await montar();

  expect(await screen.findByText('deslogado')).toBeTruthy();
  expect(readAccountFalso).not.toHaveBeenCalled();
});

it('token válido mantém a sessão', async () => {
  readToken.mockResolvedValue('token-bom');
  readAccountFalso.mockResolvedValue({ id: '1', email: 'a@b.com' });
  await montar();

  expect(await screen.findByText('logado')).toBeTruthy();
});

it('token vencido leva ao login com aviso', async () => {
  readToken.mockResolvedValue('token-vencido');
  readAccountFalso.mockImplementation(async () => {
    // Faz o 401 passar pelo interceptor de verdade, como na rede.
    await http.get('/auth/me', {
        adapter: (config) =>
          Promise.reject(
            Object.assign(new Error('401'), {
              isAxiosError: true,
              config,
              response: { status: 401, data: { detail: 'credenciais inválidas' } },
            }),
          ),
      });
  });
  await montar();

  await waitFor(() => expect(screen.getByText(/deslogado/)).toBeTruthy());
  expect(screen.getByText(/sua sessão expirou/)).toBeTruthy();
});

it('servidor fora do ar não derruba a sessão', async () => {
  readToken.mockResolvedValue('token-bom');
  readAccountFalso.mockRejectedValue(new ApiError(0, 'sem rede'));
  await montar();

  expect(await screen.findByText('logado')).toBeTruthy();
});

it('por padrão não apaga o token guardado', async () => {
  readToken.mockResolvedValue('token-bom');
  readAccountFalso.mockResolvedValue({ id: '1', email: 'a@b.com' });
  await montar();

  expect(await screen.findByText('logado')).toBeTruthy();
  expect(clearToken).not.toHaveBeenCalled();
});

it('com RESET_SESSION ligado, apaga o token e abre no login', async () => {
  mockConfig.reset = true;
  readToken.mockResolvedValue('token-bom');
  clearToken.mockImplementationOnce(async () => {
    readToken.mockResolvedValue(null);
  });
  await montar();

  expect(await screen.findByText('deslogado')).toBeTruthy();
  expect(clearToken).toHaveBeenCalled();
  expect(readAccountFalso).not.toHaveBeenCalled();
});
