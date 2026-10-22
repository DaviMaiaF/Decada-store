/** Testes da tela de entrada. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '../LoginScreen';
import { AuthProvider } from '../../services/auth';
import * as api from '../../services/api';

jest.mock('../../services/session', () => ({
  readToken: jest.fn().mockResolvedValue(null),
  saveToken: jest.fn().mockResolvedValue(undefined),
  clearToken: jest.fn().mockResolvedValue(undefined),
  saveRole: jest.fn().mockResolvedValue(undefined),
  readRole: jest.fn().mockResolvedValue('paciente'),
  readRememberMe: jest.fn().mockResolvedValue(false),
}));

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  login: jest.fn(),
  register: jest.fn(),
  loginNutritionist: jest.fn(),
  registerNutritionist: jest.fn(),
}));

const { saveToken } = jest.requireMock('../../services/session');
const loginFalso = api.login as jest.Mock;
const registerFalso = api.register as jest.Mock;
const loginNutricionistaFalso = api.loginNutritionist as jest.Mock;
const registerNutricionistaFalso = api.registerNutritionist as jest.Mock;

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
  loginFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer', role: 'paciente' });
  await montar();

  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() =>
    expect(loginFalso).toHaveBeenCalledWith('marina@example.com', 'senha-bem-boa'),
  );
});

it('"lembrar de mim" vem desmarcado e, sem marcar, o token não fica no aparelho', async () => {
  loginFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer', role: 'paciente' });
  await montar();

  const caixa = screen.getByRole('checkbox', { name: 'Lembrar de mim' });
  expect(caixa.props.accessibilityState.checked).toBe(false);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() => expect(saveToken).toHaveBeenCalledWith('token', false));
});

it('marcar "lembrar de mim" pelo texto guarda o token', async () => {
  loginFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer', role: 'paciente' });
  await montar();

  await fireEvent.press(screen.getByText('Lembrar de mim'));
  expect(
    screen.getByRole('checkbox', { name: 'Lembrar de mim' }).props.accessibilityState.checked,
  ).toBe(true);
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() => expect(saveToken).toHaveBeenCalledWith('token', true));
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
  registerFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer', role: 'paciente' });
  await montar();

  await fireEvent.press(screen.getByText('Criar uma conta'));
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'nova@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Criar conta'));

  await waitFor(() =>
    expect(registerFalso).toHaveBeenCalledWith('nova@example.com', 'senha-bem-boa', undefined),
  );
});

// --- nutricionista ---

const TOKEN_NUTRICIONISTA = { access_token: 'token', token_type: 'bearer', role: 'nutricionista' };

it('paciente é o papel padrão e entra pela porta dele', async () => {
  loginFalso.mockResolvedValue({ access_token: 'token', token_type: 'bearer', role: 'paciente' });
  await montar();

  expect(screen.getByRole('radio', { name: 'Sou paciente' }).props.accessibilityState.checked).toBe(
    true,
  );
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'marina@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() => expect(loginFalso).toHaveBeenCalled());
  expect(loginNutricionistaFalso).not.toHaveBeenCalled();
});

it('nutricionista entra pela porta dela', async () => {
  loginNutricionistaFalso.mockResolvedValue(TOKEN_NUTRICIONISTA);
  await montar();

  await fireEvent.press(screen.getByText('Sou nutricionista'));
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'camila@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Entrar'));

  await waitFor(() =>
    expect(loginNutricionistaFalso).toHaveBeenCalledWith('camila@example.com', 'senha-bem-boa'),
  );
  expect(loginFalso).not.toHaveBeenCalled();
});

it('o cadastro de paciente não pede CRN', async () => {
  await montar();

  await fireEvent.press(screen.getByText('Criar uma conta'));

  expect(screen.queryByLabelText('CRN')).toBeNull();
});

it('cadastro de nutricionista exige nome e CRN', async () => {
  await montar();

  await fireEvent.press(screen.getByText('Sou nutricionista'));
  await fireEvent.press(screen.getByText('Criar uma conta'));
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'camila@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.changeText(screen.getByLabelText('Nome completo'), 'Camila Fernandes');
  await fireEvent.press(screen.getByText('Criar conta'));

  expect(await screen.findByText('preencha nome e CRN')).toBeTruthy();
  expect(registerNutricionistaFalso).not.toHaveBeenCalled();
});

it('cadastra a nutricionista com nome e CRN', async () => {
  registerNutricionistaFalso.mockResolvedValue(TOKEN_NUTRICIONISTA);
  await montar();

  await fireEvent.press(screen.getByText('Sou nutricionista'));
  await fireEvent.press(screen.getByText('Criar uma conta'));
  await fireEvent.changeText(screen.getByLabelText('Nome completo'), ' Camila Fernandes ');
  await fireEvent.changeText(screen.getByLabelText('CRN'), 'CRN-3 48291');
  await fireEvent.changeText(screen.getByLabelText('E-mail'), 'camila@example.com');
  await fireEvent.changeText(screen.getByLabelText('Senha'), 'senha-bem-boa');
  await fireEvent.press(screen.getByText('Criar conta'));

  await waitFor(() =>
    expect(registerNutricionistaFalso).toHaveBeenCalledWith(
      'camila@example.com',
      'senha-bem-boa',
      'Camila Fernandes',
      'CRN-3 48291',
    ),
  );
  expect(registerFalso).not.toHaveBeenCalled();
});
