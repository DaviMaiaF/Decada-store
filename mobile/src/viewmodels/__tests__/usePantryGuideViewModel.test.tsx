/**
 * Testes do guia da despensa: "você tem isto em casa?" a partir do plano.
 *
 * Só entra na pergunta o item confirmado que ainda não está na despensa, e nada
 * é gravado sem a pessoa dizer "tenho" (decisão 11).
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { MealPlan, PantryItem, PlanItem, Product } from '../../types/api';
import { usePantryGuideViewModel } from '../usePantryGuideViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readMealPlan: jest.fn(),
  readPantry: jest.fn(),
  addPantryItem: jest.fn(),
}));

const lerPlano = api.readMealPlan as jest.Mock;
const lerDespensa = api.readPantry as jest.Mock;
const adicionarApi = api.addPantryItem as jest.Mock;

function produto(nome: string): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'mercearia',
    base_unit: 'kg',
    package_size: null,
    package_unit: null,
    is_fictitious: false,
  };
}

function itemDoPlano(nome: string, over: Partial<PlanItem> = {}): PlanItem {
  return {
    id: `item-${nome}`,
    position: 1,
    raw_description: nome,
    quantity: '1',
    unit: 'kg',
    status: 'confirmado',
    product_id: `produto-${nome}`,
    product: produto(nome),
    match_score: '1',
    ...over,
  };
}

function plano(items: PlanItem[]): MealPlan {
  return {
    id: 'plano-1',
    title: null,
    nutritionist_name: null,
    nutritionist_crn: null,
    consent_at: '2026-10-01T10:00:00Z',
    consent_version: '1',
    created_at: '2026-10-01T10:00:00Z',
    items,
    prescribed_meals: null,
  };
}

function naDespensa(nome: string): PantryItem {
  return { id: `p-${nome}`, raw_description: nome, product: produto(nome), quantity: null, unit: null };
}

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  lerDespensa.mockResolvedValue([]);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

function montar(planId: string | null = 'plano-1') {
  return renderHook(() => usePantryGuideViewModel(planId), { wrapper: Provedor });
}

it('pergunta só pelo que está confirmado e ainda não está na despensa', async () => {
  lerPlano.mockResolvedValue(
    plano([
      itemDoPlano('Arroz'),
      itemDoPlano('Feijão'),
      itemDoPlano('Frango', { status: 'pendente', product: null, product_id: null }),
    ]),
  );
  lerDespensa.mockResolvedValue([naDespensa('Feijão')]);

  const { result } = await montar();

  await waitFor(() => expect(result.current.perguntas).toHaveLength(1));
  expect(result.current.perguntas[0].product?.name).toBe('Arroz');
});

it('sem plano, não pergunta nada', async () => {
  const { result } = await montar(null);

  await waitFor(() => expect(lerDespensa).toHaveBeenCalled());
  expect(result.current.perguntas).toEqual([]);
  expect(lerPlano).not.toHaveBeenCalled();
});

it('"tenho" grava o item vinculado ao produto, sem quantidade, e sai da pergunta', async () => {
  lerPlano.mockResolvedValue(plano([itemDoPlano('Arroz')]));
  adicionarApi.mockResolvedValue(naDespensa('Arroz'));
  const { result } = await montar();
  await waitFor(() => expect(result.current.perguntas).toHaveLength(1));

  await act(async () => result.current.tenho(result.current.perguntas[0]));

  expect(adicionarApi).toHaveBeenCalledWith({
    raw_description: 'Arroz',
    product_id: 'produto-Arroz',
  });
  await waitFor(() => expect(result.current.perguntas).toHaveLength(0));
});

it('"não tenho" tira da pergunta sem gravar nada', async () => {
  lerPlano.mockResolvedValue(plano([itemDoPlano('Arroz')]));
  const { result } = await montar();
  await waitFor(() => expect(result.current.perguntas).toHaveLength(1));

  await act(async () => result.current.naoTenho(result.current.perguntas[0]));

  expect(result.current.perguntas).toHaveLength(0);
  expect(adicionarApi).not.toHaveBeenCalled();
});

it('se o servidor recusa, o item continua na pergunta e o erro aparece', async () => {
  lerPlano.mockResolvedValue(plano([itemDoPlano('Arroz')]));
  adicionarApi.mockRejectedValue(new api.ApiError(409, 'já está na despensa'));
  const { result } = await montar();
  await waitFor(() => expect(result.current.perguntas).toHaveLength(1));

  await act(async () => result.current.tenho(result.current.perguntas[0]));

  await waitFor(() => expect(result.current.erro).toBe('já está na despensa'));
  expect(result.current.perguntas).toHaveLength(1);
});
