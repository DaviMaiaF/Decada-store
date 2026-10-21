/**
 * Testes do ViewModel da finalização simulada.
 *
 * Confirmar só marca o que faltava, entra na conclusão no toque e volta ao
 * checkout se a chamada falhar.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { ShoppingList, ShoppingListItem } from '../../types/api';
import { useCheckoutViewModel } from '../useCheckoutViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  setItemPurchased: jest.fn(),
}));

const marcarComprado = api.setItemPurchased as jest.Mock;

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    product: {
      id: 'produto-1',
      name: 'Arroz integral',
      brand: null,
      category: 'graos',
      base_unit: 'kg' as const,
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    quantity: '1.000',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: null,
    match_score: null,
    estimated_cost: '10.00',
    unit_price_snapshot: '10.00',
    price_reference_date: '2026-10-17T10:00:00Z',
    price_origin: 'seed',
    price_confidence: 'atual',
    price_sample_size: 6,
    purchased: false,
    purchased_at: null,
    pantry_savings: '0.00',
    is_extra: false,
    ...over,
  };
}

function lista(itens: ShoppingListItem[]): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '30.00',
    calculated_at: '2026-10-17T10:00:00Z',
    items: itens,
    outdated_items: [],
  };
}

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

it('deixa de fora o que a despensa dispensou e conta o que não tem preço', async () => {
  const { result } = await renderHook(
    () =>
      useCheckoutViewModel(
        lista([
          item({ id: 'a' }),
          item({ id: 'b', estimated_cost: null }),
          item({ id: 'c', dispensed_by_pantry: true }),
        ]),
      ),
    { wrapper: Provedor },
  );

  expect(result.current.aComprar.map((i) => i.id)).toEqual(['a', 'b']);
  expect(result.current.semPreco).toBe(1);
  expect(result.current.temFicticio).toBe(false);
});

it('confirmar marca só os itens que faltavam e conclui', async () => {
  marcarComprado.mockResolvedValue(undefined);
  const { result } = await renderHook(
    () => useCheckoutViewModel(lista([item({ id: 'a', purchased: true }), item({ id: 'b' })])),
    { wrapper: Provedor },
  );

  await act(async () => result.current.confirmar());

  await waitFor(() => expect(result.current.confirmando).toBe(false));
  expect(marcarComprado).toHaveBeenCalledTimes(1);
  expect(marcarComprado).toHaveBeenCalledWith('lista-1', 'b', true);
  expect(result.current.concluido).toBe(true);
});

it('se a chamada falha, volta ao checkout com o erro', async () => {
  marcarComprado.mockRejectedValue(new Error('fora do ar'));
  const { result } = await renderHook(() => useCheckoutViewModel(lista([item({ id: 'a' })])), {
    wrapper: Provedor,
  });

  await act(async () => result.current.confirmar());

  await waitFor(() => expect(result.current.falhou).toBe(true));
  expect(result.current.concluido).toBe(false);
});
