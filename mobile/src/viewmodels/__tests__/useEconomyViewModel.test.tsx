/**
 * Testes do ViewModel da aba Economia.
 *
 * As contas que a tela mostra moram aqui: o que a despensa poupou, o que já foi
 * para o carrinho e o selo mais fraco da lista.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { ShoppingList, ShoppingListItem } from '../../types/api';
import { resumir, useEconomyViewModel } from '../useEconomyViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readShoppingList: jest.fn(),
}));

const mockSair = jest.fn();
jest.mock('../../services/auth', () => ({
  useAuth: () => ({ signOut: mockSair, signedIn: true }),
}));

const lerLista = api.readShoppingList as jest.Mock;

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    product: {
      id: 'produto-1',
      name: 'Peito de frango sem pele',
      brand: null,
      category: 'proteinas',
      base_unit: 'kg' as const,
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    quantity: '1.200',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: null,
    match_score: null,
    estimated_cost: '30.00',
    unit_price_snapshot: '25.00',
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

function lista(itens: ShoppingListItem[], over: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '60.00',
    calculated_at: '2026-10-17T10:00:00Z',
    items: itens,
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
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('estado da tela', () => {
  it('sem lista, não consulta a API', async () => {
    const { result } = await renderHook(() => useEconomyViewModel(null), { wrapper: Provedor });

    expect(result.current.conteudo.estado).toBe('sem-lista');
    expect(lerLista).not.toHaveBeenCalled();
  });

  it('carrega e depois entrega o resumo', async () => {
    lerLista.mockResolvedValue(lista([item({ id: 'a' })]));
    const { result } = await renderHook(() => useEconomyViewModel('lista-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.conteudo.estado).toBe('pronto'));
    expect(lerLista).toHaveBeenCalledWith('lista-1');
  });

  it('falha da API vira estado de erro', async () => {
    lerLista.mockRejectedValue(new Error('fora do ar'));
    const { result } = await renderHook(() => useEconomyViewModel('lista-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.conteudo.estado).toBe('erro'));
  });

  it('sair chama o signOut da sessão', async () => {
    const { result } = await renderHook(() => useEconomyViewModel(null), { wrapper: Provedor });

    result.current.sair();

    expect(mockSair).toHaveBeenCalled();
  });
});

describe('resumir', () => {
  it('soma o que a despensa poupou', () => {
    const resumo = resumir(
      lista([item({ id: 'a', pantry_savings: '12.50' }), item({ id: 'b', pantry_savings: '2.25' })]),
    );

    expect(resumo.economia).toBeCloseTo(14.75);
  });

  it('separa carrinho e falta, sem contar o que a despensa dispensou', () => {
    const resumo = resumir(
      lista([
        item({ id: 'a', estimated_cost: '20.00', purchased: true }),
        item({ id: 'b', estimated_cost: '40.00' }),
        item({ id: 'c', dispensed_by_pantry: true, estimated_cost: '0.00' }),
      ]),
    );

    expect(resumo.jaNoCarrinho).toBe(20);
    expect(resumo.falta).toBe(40);
    expect(resumo.percentual).toBeCloseTo(33.33, 1);
    expect(resumo.comprados).toBe(1);
    expect(resumo.aComprar).toBe(2);
  });

  it('item sem preço é contado à parte, não somado como zero', () => {
    const resumo = resumir(
      lista([
        item({ id: 'a' }),
        item({ id: 'b', estimated_cost: null, price_confidence: null }),
      ]),
    );

    expect(resumo.comPreco).toBe(1);
    expect(resumo.semPreco).toBe(1);
  });

  it('o selo da lista é o pior dela', () => {
    const resumo = resumir(
      lista([
        item({ id: 'a', price_confidence: 'atual' }),
        item({ id: 'b', price_confidence: 'estimativa' }),
        item({ id: 'c', price_confidence: 'recente' }),
      ]),
    );

    expect(resumo.maisFraco?.id).toBe('b');
  });

  it('total zero não divide por zero', () => {
    const resumo = resumir(lista([], { estimated_total: null }));

    expect(resumo.percentual).toBe(0);
    expect(resumo.falta).toBe(0);
  });
});
