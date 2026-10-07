/**
 * Testes da restauração do plano e da lista.
 *
 * O que importa aqui é o que a pessoa vê ao reabrir o app: quem já tem plano
 * não pode cair na tela de enviar outro, e a lista do mercado tem de voltar
 * junto. Antes os dois ids viviam só na memória desta tela.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import AppNavigator from '../AppNavigator';
import * as api from '../../services/api';
import type { MealPlanSummary, ShoppingListSummary } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readMealPlans: jest.fn(),
  readShoppingLists: jest.fn(),
  readMealPlan: jest.fn(),
  readShoppingList: jest.fn(),
  readPantry: jest.fn(),
  readRecipeSuggestions: jest.fn(),
  // A tela de confirmação busca candidatos ao montar; aqui ela só é atravessada.
  readCandidates: jest.fn(() => Promise.resolve([])),
}));

const lerPlanos = api.readMealPlans as jest.Mock;
const lerListas = api.readShoppingLists as jest.Mock;
const lerPlano = api.readMealPlan as jest.Mock;
const lerLista = api.readShoppingList as jest.Mock;

function planoSalvo(over: Partial<MealPlanSummary> = {}): MealPlanSummary {
  return {
    id: 'plano-1',
    title: null,
    nutritionist_name: 'Dra. Helena Marques',
    consent_at: '2026-09-27T10:00:00Z',
    created_at: '2026-09-27T10:00:00Z',
    item_count: 3,
    confirmed_count: 3,
    ...over,
  };
}

function listaSalva(over: Partial<ShoppingListSummary> = {}): ShoppingListSummary {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '174.20',
    calculated_at: '2026-09-27T11:00:00Z',
    created_at: '2026-09-27T11:00:00Z',
    ...over,
  };
}

const itemDoPlano = {
  position: 1,
  raw_description: '50 g de aveia em flocos',
  quantity: '50.000',
  unit: 'g' as const,
  product_id: null,
  match_score: null,
};

let cliente: QueryClient;

async function montar() {
  await render(
    <QueryClientProvider client={cliente}>
      <AppNavigator />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });

  lerPlanos.mockResolvedValue([]);
  lerListas.mockResolvedValue([]);
  lerPlano.mockResolvedValue({
    id: 'plano-1',
    title: null,
    nutritionist_name: null,
    consent_at: '2026-09-27T10:00:00Z',
    consent_version: 'v1',
    created_at: '2026-09-27T10:00:00Z',
    items: [],
  });
  lerLista.mockResolvedValue({
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '174.20',
    calculated_at: '2026-09-27T11:00:00Z',
    items: [],
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('trilha da jornada', () => {
  it('sem plano, a etapa atual é enviar', async () => {
    await montar();

    expect(await screen.findByLabelText('Etapa 1 de 4: Enviar')).toBeTruthy();
  });

  it('com plano, a etapa atual passa a ser confirmar', async () => {
    lerPlanos.mockResolvedValue([planoSalvo()]);

    await montar();

    // Quem abria o Mercado antes de confirmar via uma tela vazia sem entender
    // que o problema era a etapa anterior.
    expect(await screen.findByLabelText('Etapa 2 de 4: Confirmar')).toBeTruthy();
  });

  it('mostra o quanto falta da etapa em andamento', async () => {
    lerPlanos.mockResolvedValue([planoSalvo()]);
    lerPlano.mockResolvedValue({
      id: 'plano-1',
      title: null,
      nutritionist_name: null,
      consent_at: '2026-09-27T10:00:00Z',
      consent_version: 'v1',
      created_at: '2026-09-27T10:00:00Z',
      items: [
        { ...itemDoPlano, id: 'i1', status: 'confirmado' as const },
        { ...itemDoPlano, id: 'i2', status: 'pendente' as const },
      ],
    });

    await montar();

    expect(await screen.findByText('1/2')).toBeTruthy();
  });
});

it('quem não tem plano começa no envio do PDF', async () => {
  await montar();

  expect(await screen.findByText('Importe sua prescrição')).toBeTruthy();
});

it('quem já tem plano volta para a confirmação, não para o upload', async () => {
  lerPlanos.mockResolvedValue([planoSalvo()]);

  await montar();

  // O plano estava no banco o tempo todo; reenviar o PDF seria trabalho perdido.
  expect(await screen.findByText('Confirme os produtos')).toBeTruthy();
  expect(screen.queryByText('Importe sua prescrição')).toBeNull();
});

it('restaura o plano mais recente', async () => {
  lerPlanos.mockResolvedValue([planoSalvo({ id: 'plano-novo' }), planoSalvo({ id: 'plano-velho' })]);

  await montar();

  await waitFor(() => expect(lerPlano).toHaveBeenCalledWith('plano-novo'));
});

it('restaura a lista de compras do plano', async () => {
  lerPlanos.mockResolvedValue([planoSalvo()]);
  lerListas.mockResolvedValue([listaSalva()]);

  await montar();

  await waitFor(() => expect(lerListas).toHaveBeenCalledWith('plano-1'));

  // A aba só monta quando focada, então é preciso ir até ela para ver que a
  // lista restaurada chegou: antes, reabrir o app perdia a compra do mercado.
  await fireEvent.press(screen.getAllByText('Mercado')[0]);

  await waitFor(() => expect(lerLista).toHaveBeenCalledWith('lista-1'));
});

it('não procura lista de compras quando não há plano', async () => {
  await montar();

  await screen.findByText('Importe sua prescrição');
  expect(lerListas).not.toHaveBeenCalled();
});

it('dá caminho de volta para enviar outro plano', async () => {
  lerPlanos.mockResolvedValue([planoSalvo()]);

  await montar();
  await fireEvent.press(await screen.findByText('Enviar outro plano'));

  expect(await screen.findByText('Importe sua prescrição')).toBeTruthy();
});
