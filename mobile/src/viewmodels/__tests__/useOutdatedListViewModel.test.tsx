/**
 * Testes do ViewModel do aviso de lista desatualizada.
 *
 * A lista não se corrige sozinha: o aviso diz o que divergiu e gera de novo na
 * mesma região.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { ShoppingList } from '../../types/api';
import { descreverDivergencia, useOutdatedListViewModel } from '../useOutdatedListViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  generateShoppingList: jest.fn(),
}));

const gerarApi = api.generateShoppingList as jest.Mock;

function lista(over: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '60.00',
    calculated_at: '2026-10-17T10:00:00Z',
    items: [],
    outdated_items: [],
    ...over,
  };
}

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('descreve cada tipo de divergência', () => {
  expect(
    descreverDivergencia({ plan_item_id: 'a', description: 'Aveia', change: 'produto_trocado' }),
  ).toBe('Aveia — produto trocado');
  expect(
    descreverDivergencia({ plan_item_id: 'a', description: 'Aveia', change: 'nao_confirmado' }),
  ).toBe('Aveia — não está mais confirmado');
  expect(
    descreverDivergencia({ plan_item_id: 'a', description: 'Aveia', change: 'novo_confirmado' }),
  ).toBe('Aveia — confirmado depois da lista');
});

it('lista em dia não mostra aviso', async () => {
  const { result } = await renderHook(() => useOutdatedListViewModel(lista(), jest.fn()), {
    wrapper: Provedor,
  });

  expect(result.current.desatualizada).toBe(false);
});

it('gera de novo na mesma região e entrega o id da lista nova', async () => {
  gerarApi.mockResolvedValue({ shopping_list: { id: 'lista-2' } });
  const onGerada = jest.fn();
  const desatualizada = lista({
    outdated_items: [{ plan_item_id: 'a', description: 'Aveia', change: 'produto_trocado' }],
  });
  const { result } = await renderHook(() => useOutdatedListViewModel(desatualizada, onGerada), {
    wrapper: Provedor,
  });
  expect(result.current.divergencias).toEqual([{ id: 'a', texto: 'Aveia — produto trocado' }]);

  await act(async () => result.current.gerar());

  await waitFor(() => expect(onGerada).toHaveBeenCalledWith('lista-2'));
  expect(gerarApi).toHaveBeenCalledWith('plano-1', 'DF', 'Brasília');
});

it('falha ao gerar vira mensagem', async () => {
  gerarApi.mockRejectedValue(new Error('fora do ar'));
  const { result } = await renderHook(() => useOutdatedListViewModel(lista(), jest.fn()), {
    wrapper: Provedor,
  });

  await act(async () => result.current.gerar());

  await waitFor(() => expect(result.current.erro).toBe('não foi possível gerar a lista'));
});
