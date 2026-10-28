/**
 * Testes do aviso de lista desatualizada.
 *
 * O que não pode falhar: quem só mexeu na despensa não lê "seu plano mudou",
 * e cada divergência aparece com o motivo.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { ListaDesatualizada } from '../ListaDesatualizada';
import type { OutdatedItem, ShoppingList } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  generateShoppingList: jest.fn(),
}));

function lista(outdated_items: OutdatedItem[]): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '60.00',
    calculated_at: '2026-10-17T10:00:00Z',
    items: [],
    outdated_items,
  };
}

let cliente: QueryClient;

async function montar(dados: ShoppingList) {
  await render(
    <QueryClientProvider client={cliente}>
      <ListaDesatualizada lista={dados} onGenerated={jest.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  cliente = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('lista em dia não mostra nada', async () => {
  await montar(lista([]));

  expect(screen.queryByText('Gerar lista atualizada')).toBeNull();
});

it('despensa alterada fala da despensa e explica o desconto antigo', async () => {
  await montar(
    lista([
      { plan_item_id: 'pi-1', description: '1,2 kg de frango', change: 'despensa_alterada' },
    ]),
  );

  expect(screen.getByText('Sua despensa mudou depois desta lista')).toBeTruthy();
  expect(screen.queryByText('Seu plano mudou depois desta lista')).toBeNull();
  expect(screen.getByText(/calculado com a despensa de antes/)).toBeTruthy();
  expect(screen.getByText(/1,2 kg de frango — despensa mudou/)).toBeTruthy();
  expect(screen.getByText('Gerar lista atualizada')).toBeTruthy();
});

it('mudança no plano continua falando do plano', async () => {
  await montar(
    lista([{ plan_item_id: 'pi-1', description: '1,2 kg de frango', change: 'produto_trocado' }]),
  );

  expect(screen.getByText('Seu plano mudou depois desta lista')).toBeTruthy();
});
