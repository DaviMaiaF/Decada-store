/**
 * Testes do ViewModel dos planos recebidos.
 *
 * O aceite leva o consentimento que a pessoa marcou (decisão 5), e responder
 * tira o plano da lista de pendentes.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import { ApiError } from '../../services/api';
import type { ImportResult, ReceivedPrescription } from '../../types/api';
import {
  RECEIVED_KEY,
  useReceivedPrescriptionViewModel,
  useReceivedPrescriptionsViewModel,
} from '../useReceivedPrescriptionsViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(),
  acceptPrescription: jest.fn(),
  declinePrescription: jest.fn(),
}));

const lerRecebidos = api.readReceivedPrescriptions as jest.Mock;
const aceitarApi = api.acceptPrescription as jest.Mock;
const recusarApi = api.declinePrescription as jest.Mock;

const RECEBIDO: ReceivedPrescription = {
  id: 'plano-1',
  title: 'Plano de outubro',
  notes: null,
  sent_at: '2026-10-19T10:00:00Z',
  author: { full_name: 'Camila Fernandes', crn: null },
  meals: [],
};

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('a lista começa vazia e depois traz os planos pendentes', async () => {
  lerRecebidos.mockResolvedValue([RECEBIDO]);
  const { result } = await renderHook(() => useReceivedPrescriptionsViewModel(), {
    wrapper: Provedor,
  });

  await waitFor(() => expect(result.current.planos).toHaveLength(1));
});

it('assina só com o nome quando a autora não tem CRN', async () => {
  const { result } = await renderHook(() => useReceivedPrescriptionViewModel(RECEBIDO, jest.fn()), {
    wrapper: Provedor,
  });

  expect(result.current.autora).toBe('Camila Fernandes');
  expect(result.current.aceitou).toBe(false);
});

it('aceitar leva o consentimento, avisa a tela e atualiza os planos', async () => {
  const resultado = { items_created: 2 } as unknown as ImportResult;
  aceitarApi.mockResolvedValue(resultado);
  const invalidar = jest.spyOn(cliente, 'invalidateQueries');
  const onAceito = jest.fn();
  const { result } = await renderHook(() => useReceivedPrescriptionViewModel(RECEBIDO, onAceito), {
    wrapper: Provedor,
  });

  await act(async () => result.current.alternarAceite());
  await act(async () => result.current.aceitar());

  await waitFor(() => expect(onAceito).toHaveBeenCalledWith(resultado));
  expect(aceitarApi).toHaveBeenCalledWith('plano-1', true);
  expect(invalidar).toHaveBeenCalledWith({ queryKey: RECEIVED_KEY });
  expect(invalidar).toHaveBeenCalledWith({ queryKey: ['meal-plans'] });
});

it('recusar não chama o aceite e mostra o erro da API', async () => {
  recusarApi.mockRejectedValue(new ApiError(404, 'plano não encontrado'));
  const { result } = await renderHook(() => useReceivedPrescriptionViewModel(RECEBIDO, jest.fn()), {
    wrapper: Provedor,
  });

  await act(async () => result.current.recusar());

  await waitFor(() => expect(result.current.erro).toBe('plano não encontrado'));
  expect(aceitarApi).not.toHaveBeenCalled();
});

it('abre e fecha a leitura do plano', async () => {
  const { result } = await renderHook(() => useReceivedPrescriptionViewModel(RECEBIDO, jest.fn()), {
    wrapper: Provedor,
  });

  await act(async () => result.current.alternarLeitura());
  expect(result.current.aberto).toBe(true);
  await act(async () => result.current.alternarLeitura());
  expect(result.current.aberto).toBe(false);
});
