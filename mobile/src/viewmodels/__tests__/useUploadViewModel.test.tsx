/**
 * Testes do ViewModel do envio de PDF.
 *
 * Nada sai do app sem arquivo e consentimento; o que a nutricionista e o CRN
 * levam é opcional, e o resultado do servidor fica guardado para o resumo.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import * as api from '../../services/api';
import { ApiError } from '../../services/api';
import type { ImportResult } from '../../types/api';
import { useUploadViewModel } from '../useUploadViewModel';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  importMealPlan: jest.fn(),
}));

const escolherDocumento = DocumentPicker.getDocumentAsync as jest.Mock;
const importar = api.importMealPlan as jest.Mock;

const RESULTADO = {
  meal_plan: { id: 'plano-1' },
  items_created: 3,
  items_matched: 2,
  items_unidentified: 1,
  discarded: [],
} as unknown as ImportResult;

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function montar() {
  return renderHook(() => useUploadViewModel(), { wrapper: Provedor });
}

async function escolherPdf(result: { current: ReturnType<typeof useUploadViewModel> }) {
  escolherDocumento.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///plano.pdf', name: 'plano.pdf', mimeType: 'application/pdf' }],
  });
  await act(() => result.current.escolher());
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('diz o que falta, na ordem em que a pessoa resolve', async () => {
  const { result } = await montar();
  expect(result.current.faltando).toBe('Escolha o PDF e marque o aceite para enviar.');

  await act(async () => result.current.alternarAceite());
  expect(result.current.faltando).toBe('Escolha o PDF para enviar.');

  await escolherPdf(result);
  expect(result.current.faltando).toBeNull();
  expect(result.current.podeEnviar).toBe(true);
  expect(result.current.nomeDoArquivo).toBe('plano.pdf');
});

it('cancelar a escolha não muda nada', async () => {
  escolherDocumento.mockResolvedValue({ canceled: true, assets: null });
  const { result } = await montar();

  await act(() => result.current.escolher());

  expect(result.current.nomeDoArquivo).toBeNull();
});

it('envia com o consentimento e os dados opcionais sem espaços', async () => {
  importar.mockResolvedValue(RESULTADO);
  const { result } = await montar();
  await escolherPdf(result);
  await act(async () => {
    result.current.alternarAceite();
    result.current.setNutricionista('  Dra. Camila ');
    result.current.setCrn('   ');
  });

  await act(async () => result.current.enviar());

  await waitFor(() => expect(result.current.resultado).toEqual(RESULTADO));
  expect(importar).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'plano.pdf' }),
    true,
    { nutritionistName: 'Dra. Camila', nutritionistCrn: undefined },
  );
});

it('mostra a mensagem da API e, para erro desconhecido, um texto genérico', async () => {
  importar.mockRejectedValueOnce(new ApiError(422, 'o PDF não tem texto selecionável'));
  const { result } = await montar();
  await escolherPdf(result);
  await act(async () => result.current.alternarAceite());

  await act(async () => result.current.enviar());
  await waitFor(() => expect(result.current.erro).toBe('o PDF não tem texto selecionável'));

  importar.mockRejectedValueOnce(new Error('rede'));
  await act(async () => result.current.enviar());
  await waitFor(() => expect(result.current.erro).toBe('não foi possível enviar o PDF'));
});

it('trocar de arquivo apaga o resultado e o erro do envio anterior', async () => {
  importar.mockResolvedValue(RESULTADO);
  const { result } = await montar();
  await escolherPdf(result);
  await act(async () => result.current.alternarAceite());
  await act(async () => result.current.enviar());
  await waitFor(() => expect(result.current.resultado).not.toBeNull());

  await escolherPdf(result);

  expect(result.current.resultado).toBeNull();
  expect(result.current.erro).toBeNull();
});
