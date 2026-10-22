/**
 * Testes do ViewModel de entrada.
 *
 * A validação acontece antes da API: nada sai do app com campo faltando ou
 * senha curta, e cada papel entra pela porta dele.
 */

import { act, renderHook } from '@testing-library/react-native';

import { ApiError } from '../../services/api';
import { useLoginViewModel } from '../useLoginViewModel';

const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignUpNutritionist = jest.fn();
let mockNotice: string | null = null;

jest.mock('../../services/auth', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    signUp: mockSignUp,
    signUpNutritionist: mockSignUpNutritionist,
    notice: mockNotice,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockNotice = null;
});

async function montar() {
  return renderHook(() => useLoginViewModel());
}

it('sem e-mail ou senha, não chama a API', async () => {
  const { result } = await montar();

  await act(() => result.current.enviar());

  expect(result.current.mensagem).toBe('preencha e-mail e senha');
  expect(mockSignIn).not.toHaveBeenCalled();
});

it('entra como paciente por padrão, com o e-mail sem espaços', async () => {
  const { result } = await montar();

  await act(async () => {
    result.current.setEmail('  ana@example.com ');
    result.current.setSenha('segredo123');
  });
  await act(() => result.current.enviar());

  expect(mockSignIn).toHaveBeenCalledWith('ana@example.com', 'segredo123', 'paciente', false);
  expect(result.current.enviando).toBe(false);
});

it('no cadastro, acusa a senha curta enquanto a pessoa digita e barra o envio', async () => {
  const { result } = await montar();

  await act(async () => {
    result.current.alternarCadastro();
    result.current.setEmail('ana@example.com');
    result.current.setSenha('curta');
  });
  expect(result.current.senhaCurta).toBe(true);

  await act(() => result.current.enviar());

  expect(result.current.mensagem).toBe('a senha precisa de pelo menos 8 caracteres');
  expect(mockSignUp).not.toHaveBeenCalled();
});

it('cadastro de nutricionista exige nome e CRN e usa a porta dela', async () => {
  const { result } = await montar();

  await act(async () => {
    result.current.escolherPapel('nutricionista');
    result.current.alternarCadastro();
    result.current.setEmail('camila@example.com');
    result.current.setSenha('segredo123');
  });
  await act(() => result.current.enviar());
  expect(result.current.mensagem).toBe('preencha nome e CRN');

  await act(async () => {
    result.current.setNome(' Camila Fernandes ');
    result.current.setCrn('CRN-3 48291');
  });
  await act(() => result.current.enviar());

  expect(mockSignUpNutritionist).toHaveBeenCalledWith(
    'camila@example.com',
    'segredo123',
    'Camila Fernandes',
    'CRN-3 48291',
    false,
  );
  expect(mockSignUp).not.toHaveBeenCalled();
});

it('"lembrar de mim" vem desmarcado e segue para o login quando marcado', async () => {
  const { result } = await montar();
  expect(result.current.lembrar).toBe(false);

  await act(async () => {
    result.current.alternarLembrar();
    result.current.setEmail('ana@example.com');
    result.current.setSenha('segredo123');
  });
  await act(() => result.current.enviar());

  expect(mockSignIn).toHaveBeenCalledWith('ana@example.com', 'segredo123', 'paciente', true);
});

it('mostra a mensagem da API; erro desconhecido vira texto genérico', async () => {
  mockSignIn.mockRejectedValueOnce(new ApiError(401, 'e-mail ou senha incorretos'));
  const { result } = await montar();
  await act(async () => {
    result.current.setEmail('ana@example.com');
    result.current.setSenha('errada123');
  });

  await act(() => result.current.enviar());
  expect(result.current.mensagem).toBe('e-mail ou senha incorretos');

  mockSignIn.mockRejectedValueOnce(new Error('rede'));
  await act(() => result.current.enviar());
  expect(result.current.mensagem).toBe('não foi possível entrar agora');
});

it('trocar de papel limpa o erro', async () => {
  const { result } = await montar();
  await act(() => result.current.enviar());
  expect(result.current.mensagem).not.toBeNull();

  await act(async () => result.current.escolherPapel('nutricionista'));

  expect(result.current.mensagem).toBeNull();
  expect(result.current.nutricionista).toBe(true);
});

it('sem erro do formulário, mostra o aviso da sessão', async () => {
  mockNotice = 'sua sessão expirou; entre de novo';
  const { result } = await montar();

  expect(result.current.mensagem).toBe('sua sessão expirou; entre de novo');
});
