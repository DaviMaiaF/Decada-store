/**
 * Testes da confirmação do casamento item–produto.
 *
 * A regra que estes testes protegem é a decisão 4: o servidor sugere, quem
 * confirma é a pessoa. O candidato aparecer já visível encurta o caminho sem
 * mudar quem decide — nada é gravado até alguém tocar em "Confirmar".
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ConfirmationScreen from '../ConfirmationScreen';
import * as api from '../../services/api';
import type { Candidate, MealPlan, PlanItem } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readMealPlan: jest.fn(),
  readCandidates: jest.fn(),
  confirmItem: jest.fn(),
}));

const lerPlano = api.readMealPlan as jest.Mock;
const lerCandidatos = api.readCandidates as jest.Mock;
const confirmar = api.confirmItem as jest.Mock;

function item(over: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    position: 1,
    raw_description: '50 g de aveia em flocos',
    quantity: '50.000',
    unit: 'g',
    status: 'pendente',
    product_id: null,
    match_score: null,
    ...over,
  };
}

function plano(itens: PlanItem[]): MealPlan {
  return {
    id: 'plano-1',
    title: null,
    nutritionist_name: null,
    consent_at: '2026-09-27T10:00:00Z',
    consent_version: 'v1',
    created_at: '2026-09-27T10:00:00Z',
    items: itens,
  };
}

function candidato(nome: string, score: string, over: Partial<Candidate> = {}): Candidate {
  return {
    product: {
      id: `produto-${nome}`,
      name: nome,
      brand: 'Manhã Boa',
      category: 'mercearia',
      base_unit: 'kg',
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    score,
    unit_compatible: true,
    quantity_in_base: '0.050',
    packages_needed: 1,
    ...over,
  };
}

let cliente: QueryClient;

async function montar(onReady = jest.fn(), onNewPlan = jest.fn()) {
  await render(
    <QueryClientProvider client={cliente}>
      <ConfirmationScreen planId="plano-1" onReady={onReady} onNewPlan={onNewPlan} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1' })]));
  lerCandidatos.mockResolvedValue([
    candidato('Aveia em flocos', '0.940'),
    candidato('Granola tradicional', '0.610'),
  ]);
  confirmar.mockResolvedValue(item({ id: 'item-1', status: 'confirmado' }));
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('mostra o candidato mais provável sem precisar abrir', async () => {
  await montar();

  // Antes era preciso abrir item por item: três toques para cada um dos 15.
  expect(await screen.findByText('Aveia em flocos')).toBeTruthy();
  expect(screen.getByText(/94% de semelhança/)).toBeTruthy();
});

it('não grava nada só por mostrar o candidato', async () => {
  await montar();

  await screen.findByText('Aveia em flocos');
  // Decisão 4: o casamento nunca é automático.
  expect(confirmar).not.toHaveBeenCalled();
});

it('confirma o candidato sugerido em um toque', async () => {
  await montar();

  await fireEvent.press(await screen.findByText('Confirmar'));

  await waitFor(() =>
    expect(confirmar).toHaveBeenCalledWith(
      'plano-1',
      'item-1',
      'produto-Aveia em flocos',
      '0.940',
    ),
  );
});

it('abre as outras opções para quem discorda da sugestão', async () => {
  await montar();

  await fireEvent.press(await screen.findByText('Ver outras opções'));

  expect(await screen.findByText('Granola tradicional')).toBeTruthy();
});

it('item já confirmado não procura candidato', async () => {
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1', status: 'confirmado' })]));

  await montar();

  await screen.findByText('confirmado');
  expect(lerCandidatos).not.toHaveBeenCalled();
});

it('avisa quando o catálogo não tem nada parecido', async () => {
  lerCandidatos.mockResolvedValue([]);

  await montar();

  expect(
    await screen.findByText('Nenhum produto do catálogo se parece com este item.'),
  ).toBeTruthy();
});

it('o rodapé leva ao mercado, e não promete gerar a lista', async () => {
  const onReady = jest.fn();
  lerPlano.mockResolvedValue(plano([item({ id: 'item-1', status: 'confirmado' })]));

  await montar(onReady);

  // Havia dois botões "Gerar lista de compras" em telas diferentes; só o do
  // Mercado gera de fato.
  await fireEvent.press(await screen.findByText('Ir para o mercado'));
  expect(onReady).toHaveBeenCalledWith('plano-1');
});
