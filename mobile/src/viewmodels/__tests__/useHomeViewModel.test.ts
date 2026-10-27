/** Testes do ViewModel da tela de início. */

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { ReceivedPrescription } from '../../types/api';
import { useHomeViewModel } from '../useHomeViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(),
}));

const lerRecebidos = api.readReceivedPrescriptions as jest.Mock;

function recebido(id: string, crn: string | null = null): ReceivedPrescription {
  return {
    id,
    title: 'Plano de outubro',
    notes: null,
    sent_at: '2026-10-19T10:00:00Z',
    author: { full_name: 'Camila Fernandes', crn },
    meals: [],
  };
}

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: cliente }, children);
}

beforeEach(() => {
  jest.clearAllMocks();
  lerRecebidos.mockResolvedValue([]);
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

function jornada(cumpridas: boolean[]) {
  return ['Enviar', 'Confirmar', 'Despensa', 'Região', 'Comprar'].map((rotulo, i) => ({
    rotulo,
    cumprida: cumpridas[i],
  }));
}

it('no meio da jornada, devolve a etapa atual e não a conclusão', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, false, false, false, false])), {
    wrapper: Provedor,
  });

  expect(result.current.passo.botao).toBe('Confirmar produtos');
  expect(result.current.jornadaConcluida).toBe(false);
});

it('com tudo cumprido, marca a jornada como concluída', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, true, true, true, true])), {
    wrapper: Provedor,
  });

  expect(result.current.jornadaConcluida).toBe(true);
  expect(result.current.passo.aba).toBe('Economia');
});

it('acompanha a trilha quando ela muda', async () => {
  const { result, rerender } = await renderHook(
    ({ cumpridas }: { cumpridas: boolean[] }) => useHomeViewModel(jornada(cumpridas)),
    { initialProps: { cumpridas: [false, false, false, false, false] }, wrapper: Provedor },
  );
  expect(result.current.passo.aba).toBe('Dieta');

  await rerender({ cumpridas: [true, true, true, false, false] });

  expect(result.current.passo.aba).toBe('Mercado');
});

it('sem plano enviado pela nutricionista, não há aviso', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([false, false, false, false, false])), {
    wrapper: Provedor,
  });

  await waitFor(() => expect(lerRecebidos).toHaveBeenCalled());
  expect(result.current.planoRecebido).toBeNull();
});

it('com um plano enviado ao e-mail da conta, avisa quem montou', async () => {
  lerRecebidos.mockResolvedValue([recebido('plano-1', 'CRN-1 12345')]);
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, true, true, false, false])), {
    wrapper: Provedor,
  });

  await waitFor(() => expect(result.current.planoRecebido).not.toBeNull());
  expect(result.current.planoRecebido?.titulo).toBe('Seu plano alimentar já foi montado');
  expect(result.current.planoRecebido?.texto).toContain('Camila Fernandes · CRN-1 12345');
  // O aviso não mexe na jornada: a próxima etapa segue a trilha.
  expect(result.current.passo.aba).toBe('Mercado');
});

it('com mais de um plano, diz quantos chegaram', async () => {
  lerRecebidos.mockResolvedValue([recebido('plano-1'), recebido('plano-2')]);
  const { result } = await renderHook(() => useHomeViewModel(jornada([false, false, false, false, false])), {
    wrapper: Provedor,
  });

  await waitFor(() =>
    expect(result.current.planoRecebido?.titulo).toBe('2 planos alimentares chegaram para você'),
  );
});

it('com o plano confirmado e a despensa em branco, o passo é cadastrar a despensa', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, true, false, false, false])), {
    wrapper: Provedor,
  });

  expect(result.current.passo.aba).toBe('Despensa');
  expect(result.current.passo.botao).toBe('Cadastrar a despensa');
});
