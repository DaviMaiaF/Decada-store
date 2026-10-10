/**
 * Testes do envio da prescrição.
 *
 * O foco é o que a tela diz quando ainda não dá para enviar: botão inerte sem
 * explicação faz a pessoa tocar de novo achando que o app falhou.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import UploadScreen from '../UploadScreen';

let cliente: QueryClient;

beforeEach(() => {
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

function montar() {
  return render(
    <QueryClientProvider client={cliente}>
      <UploadScreen onImported={jest.fn()} />
    </QueryClientProvider>,
  );
}

it('diz que faltam o arquivo e o aceite', async () => {
  await montar();

  expect(screen.getByText('Escolha o PDF e marque o aceite para enviar.')).toBeTruthy();
});

it('depois do aceite, cobra só o arquivo', async () => {
  await montar();

  await fireEvent.press(
    screen.getByLabelText('Aceito o tratamento do meu plano alimentar'),
  );

  expect(screen.getByText('Escolha o PDF para enviar.')).toBeTruthy();
});

it('a nutricionista e o CRN são opcionais: a trava do envio não os cobra', async () => {
  await montar();

  expect(screen.getByLabelText('Nutricionista').props.value).toBe('');
  expect(screen.getByLabelText('CRN').props.value).toBe('');

  await fireEvent.press(screen.getByLabelText('Aceito o tratamento do meu plano alimentar'));

  // Com os dois campos vazios, o que falta é só o arquivo.
  expect(screen.getByText('Escolha o PDF para enviar.')).toBeTruthy();
});

it('o aceite é um passo da tela, e não um padrão marcado', async () => {
  await montar();

  // Decisão 5 (LGPD): consentimento é explícito, então nasce desmarcado.
  expect(screen.getByLabelText('Aceito o tratamento do meu plano alimentar').props
    .accessibilityState.checked).toBe(false);
});
