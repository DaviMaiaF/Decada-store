/**
 * Testes da aba Economia.
 *
 * O que a tela promete: só número que o servidor sabe calcular. Nenhum valor
 * de economia aparece sem base, e o selo de confiança da lista é o mais fraco
 * dela — não o melhor.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import EconomyScreen from '../EconomyScreen';
import * as api from '../../services/api';
import type { ShoppingList, ShoppingListItem } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readShoppingList: jest.fn(),
}));

jest.mock('../../services/auth', () => ({
  useAuth: () => ({ signOut: jest.fn(), signedIn: true }),
}));

const lerLista = api.readShoppingList as jest.Mock;

const HA_TRES_DIAS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
const HA_QUARENTA_DIAS = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();

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
    price_reference_date: HA_TRES_DIAS,
    price_origin: 'seed',
    price_confidence: 'atual',
    price_sample_size: 6,
    purchased: false,
    purchased_at: null,
    pantry_savings: '0.00',
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
    calculated_at: HA_TRES_DIAS,
    items: itens,
    ...over,
  };
}

let cliente: QueryClient;

async function montar(dados: ShoppingList | null) {
  if (dados) lerLista.mockResolvedValue(dados);

  await render(
    <QueryClientProvider client={cliente}>
      <EconomyScreen listId={dados ? 'lista-1' : null} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('sem lista gerada, explica o que fazer em vez de mostrar zeros', async () => {
  await montar(null);

  expect(
    await screen.findByText(/Gere sua lista na aba Mercado/),
  ).toBeTruthy();
  // Zerar tudo daria a impressão de uma compra de R$ 0,00.
  expect(screen.queryByText('R$ 0,00')).toBeNull();
});

it('mostra o que a despensa poupou, somando os itens', async () => {
  await montar(
    lista([
      item({ id: 'a', pantry_savings: '12.50' }),
      item({ id: 'b', pantry_savings: '2.25' }),
    ]),
  );

  expect(await screen.findByText('R$ 14,75')).toBeTruthy();
});

it('não inventa economia quando a despensa não tirou nada do carrinho', async () => {
  await montar(lista([item({ id: 'a', pantry_savings: '0.00' })]));

  // "R$ 0,00" aparece também em "Já no carrinho"; o que distingue esta tela de
  // uma que inventaria número é a explicação do zero.
  expect(
    await screen.findByText(/não chegou a tirar uma embalagem do carrinho/),
  ).toBeTruthy();
  expect(screen.getAllByText('R$ 0,00').length).toBeGreaterThan(0);
});

it('separa o que já está no carrinho do que ainda falta', async () => {
  await montar(
    lista([
      item({ id: 'a', estimated_cost: '20.00', purchased: true }),
      item({ id: 'b', estimated_cost: '40.00' }),
    ]),
  );

  expect(await screen.findByText('R$ 20,00')).toBeTruthy();
  expect(screen.getByText('R$ 40,00')).toBeTruthy();
  expect(screen.getByText('1 de 2 itens comprados')).toBeTruthy();
});

it('item dispensado pela despensa não conta no trajeto pelo mercado', async () => {
  await montar(
    lista([
      item({ id: 'a', estimated_cost: '60.00' }),
      item({
        id: 'b',
        quantity: '0.000',
        quantity_from_pantry: '1.200',
        dispensed_by_pantry: true,
        estimated_cost: '0.00',
      }),
    ]),
  );

  expect(await screen.findByText('0 de 1 itens comprados')).toBeTruthy();
});

it('conta os itens sem preço em vez de somá-los como zero', async () => {
  await montar(
    lista([
      item({ id: 'a' }),
      item({
        id: 'b',
        estimated_cost: null,
        price_confidence: null,
        price_reference_date: null,
      }),
    ]),
  );

  expect(await screen.findByText(/Item sem preço na sua região fica fora do total/)).toBeTruthy();
});

it('o selo da lista é o pior dela, não o melhor', async () => {
  await montar(
    lista([
      item({ id: 'a', price_confidence: 'atual', price_reference_date: HA_TRES_DIAS }),
      item({
        id: 'b',
        price_confidence: 'estimativa',
        price_reference_date: HA_QUARENTA_DIAS,
      }),
    ]),
  );

  // Decisão 1: preço com mais de 30 dias é estimativa, e isso contamina a lista.
  expect(await screen.findByText(/estimativa — coletado há 40 dias/)).toBeTruthy();
});

it('mostra a região dos preços, que nunca é nacional', async () => {
  await montar(lista([item({ id: 'a' })]));

  expect(await screen.findByText('Preços de Brasília · DF')).toBeTruthy();
});

it('tem como sair da conta', async () => {
  await montar(lista([item({ id: 'a' })]));

  // App com dado de saúde precisa de uma saída visível.
  expect(await screen.findByText('Sair da conta')).toBeTruthy();
});
