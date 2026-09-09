/** Testes da tela de entrada. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '../LoginScreen';
import { AuthProvider } from '../../services/auth';
import * as api from '../../services/api';

jest.mock('../../services/session', () => ({
  readToken: jest.fn().mockResolvedValue(null),
  saveToken: jest.fn().mockResolvedValue(undefined),
  clearToken: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  login: jest.fn(),
  register: jest.fn(),
}));

const loginFalso = api.login as jest.Mock;
const registerFalso = api.register as jest.Mock;

/**
 * O `render` da RNTL 14 é assíncrono e as consultas vêm do `screen`, não do
 * retorno — mudança da versão 14, que passou a rodar `act` assíncrono para dar
 * conta de Suspense e do hook `use()`.
 */
async function montar() {
  await render(
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>,
  );
}

beforeEach(() => jest.clearAllMocks());

it('entra com e-mail e senha', async () => {
  loginFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer' });
  await montar();

  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() =>
    expect(loginFalso).toHaveBeenCalledWith('marina@example.com', 'senha-bem-boa'),
  );
});

it('cobra os dois campos antes de chamar a API', async () => {
  await montar();

  await fireEvent.press(screen.getByText('Entrar'));

  expect(await screen.findByText('preencha e-mail e senha')).toBeTruthy();
  expect(loginFalso).not.toHaveBeenCalled();
});

it('mostra a mensagem que o servidor devolveu', async () => {
  loginFalso.mockRejectedValue(new api.ApiError(401, 'e-mail ou senha inválidos'));
  await montar();

  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'errada');
  await fireEvent.press(screen.getByText('Entrar'));

  expect(await screen.findByText('e-mail ou senha inválidos')).toBeTruthy();
});

it('alterna para cadastro e exige senha mínima', async () => {
  await montar();

  await fireEvent.press(screen.getByText('Criar uma conta'));
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'nova@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'curta');
  await fireEvent.press(screen.getByText('Criar conta'));

  expect(
    await screen.findByText('a senha precisa de pelo menos 8 caracteres'),
  ).toBeTruthy();
  expect(registerFalso).not.toHaveBeenCalled();
});

it('cadastra quando a senha tem tamanho suficiente', async () => {
  registerFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer' });
  await montar();

  await fireEvent.press(screen.getByText('Criar uma conta'));
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'nova@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Criar conta'));

  await waitFor(() =>
    expect(registerFalso).toHaveBeenCalledWith('nova@example.com', 'senha-bem-boa', undefined),
  );
});
