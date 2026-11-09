/**
 * Testes do envio da prescrição.
 *
 * O foco é o que a tela diz quando ainda não dá para enviar: botão inerte sem
 * explicação faz a pessoa tocar de novo achando que o app falhou.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import { importMealPlan } from '../../services/api';
import type { ImportResult } from '../../types/api';
import UploadScreen from '../UploadScreen';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

// Sem plano enviado pela nutricionista: a tela é só a do PDF.
jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(() => Promise.resolve([])),
  importMealPlan: jest.fn(),
}));

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

describe('linhas que não viraram item', () => {
  // Texto repetido é o caso normal: o cabeçalho do PDF volta em toda página.
  function resultadoCom(textos: string[]) {
    return {
      items_created: 1,
      items_matched: 1,
      items_unidentified: 0,
      discarded: textos.map((text) => ({ text, reason: 'não é item alimentar' })),
    } as ImportResult;
  }

  let erroDoConsole: jest.SpyInstance;

  function avisosDeKeyRepetida() {
    return erroDoConsole.mock.calls.filter((chamada) => chamada.join(' ').includes('same key'));
  }

  async function prepararEnvio() {
    await montar();
    await fireEvent.press(screen.getByText('Escolher PDF'));
    await fireEvent.press(screen.getByLabelText('Aceito o tratamento do meu plano alimentar'));
  }

  async function enviarERecebe(resultado: ImportResult) {
    jest.mocked(importMealPlan).mockResolvedValueOnce(resultado);
    await fireEvent.press(screen.getByText('Enviar prescrição'));
    await screen.findByText(`${resultado.discarded.length} linha(s) não viraram item`);
  }

  beforeEach(() => {
    erroDoConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///plano.pdf', name: 'plano.pdf' }],
    } as DocumentPicker.DocumentPickerResult);
  });

  afterEach(() => {
    erroDoConsole.mockRestore();
  });

  it('mostra cada repetição, sem colidir a key', async () => {
    await prepararEnvio();

    await enviarERecebe(resultadoCom(['Cabeçalho', 'Ingredientes:', 'Cabeçalho', 'Cabeçalho']));

    expect(screen.getAllByText('Cabeçalho')).toHaveLength(3);
    expect(screen.getAllByText('Ingredientes:')).toHaveLength(1);
    expect(avisosDeKeyRepetida()).toEqual([]);
  });

  it('um novo resultado não deixa linha do anterior na tela', async () => {
    await prepararEnvio();
    await enviarERecebe(resultadoCom(['Cabeçalho', 'Cabeçalho', 'Cabeçalho', 'Rodapé']));

    await enviarERecebe(resultadoCom(['Outra linha']));

    expect(screen.getAllByText('Outra linha')).toHaveLength(1);
    expect(screen.queryByText('Cabeçalho')).toBeNull();
    expect(screen.queryByText('Rodapé')).toBeNull();
  });
});
