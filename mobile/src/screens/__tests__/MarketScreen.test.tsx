/**
 * Testes da lista de compras.
 *
 * O foco é o que a tela promete ao usuário: agrupar por corredor, mostrar o
 * desconto da despensa e nunca exibir preço sem data e origem.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import MarketScreen from '../MarketScreen';
import * as api from '../../services/api';
import type { ShoppingList, ShoppingListItem } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readShoppingList: jest.fn(),
  generateShoppingList: jest.fn(),
  setItemPurchased: jest.fn(),
}));

const lerLista = api.readShoppingList as jest.Mock;
const marcarItem = api.setItemPurchased as jest.Mock;

const HA_TRES_DIAS = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

function produto(nome: string, categoria: string) {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: categoria,
    base_unit: 'kg' as const,
    package_size: null,
    package_unit: null,
    is_fictitious: false,
  };
}

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    product: produto('Peito de frango sem pele', 'proteinas'),
    quantity: '1.200',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: null,
    match_score: null,
    estimated_cost: '34.50',
    unit_price_snapshot: '28.75',
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

function lista(itens: ShoppingListItem[]): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '174.20',
    calculated_at: HA_TRES_DIAS,
    items: itens,
  };
}

let cliente: QueryClient;

async function montar(dados: ShoppingList) {
  lerLista.mockResolvedValue(dados);

  await render(
    <QueryClientProvider client={cliente}>
      <MarketScreen planId="plano-1" listId="lista-1" onGenerated={jest.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // `gcTime` das mutações é 5 minutos por padrão, e cada mutação que roda deixa
  // esse temporizador de pé — o suficiente para o Jest não encerrar sozinho.
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
});

// Sem isto o cache do React Query deixa temporizadores abertos e o Jest não
// encerra sozinho ao fim da suíte.
afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('mostra o total estimado e a região', async () => {
  await montar(lista([item({ id: 'a' })]));

  expect(await screen.findByText('R$ 174,20')).toBeTruthy();
  // Média de preço é sempre regional: a tela precisa dizer de onde ela é.
  expect(screen.getByText('Brasília · DF')).toBeTruthy();
});

it('agrupa os itens pelos corredores do mercado', async () => {
  await montar(
    lista([
      item({ id: 'a' }),
      item({ id: 'b', product: produto('Banana prata', 'hortifruti') }),
      item({ id: 'c', product: produto('Aveia em flocos', 'mercearia') }),
    ]),
  );

  expect(await screen.findByText('Carnes & Ovos')).toBeTruthy();
  expect(screen.getByText('Hortifrúti')).toBeTruthy();
  expect(screen.getByText('Mercearia & Grãos')).toBeTruthy();
});

it('nenhum preço aparece sem data, origem e amostra', async () => {
  await montar(lista([item({ id: 'a' })]));

  // Decisão 1 do projeto, no último lugar onde ela pode se perder.
  expect(
    await screen.findByText('coletado há 3 dias · dado fictício de desenvolvimento · 6 coleta(s)'),
  ).toBeTruthy();
});

it('avisa quando o preço é estimativa', async () => {
  const vencido = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  await montar(
    lista([item({ id: 'a', price_confidence: 'estimativa', price_reference_date: vencido })]),
  );

  expect(await screen.findByText(/estimativa — coletado há 45 dias/)).toBeTruthy();
});

it('avisa quando não há preço na região', async () => {
  await montar(
    lista([
      item({
        id: 'a',
        estimated_cost: null,
        price_confidence: null,
        price_reference_date: null,
        price_origin: null,
        price_sample_size: null,
      }),
    ]),
  );

  // Ausência de preço não pode virar R$ 0,00.
  expect(await screen.findByText('—')).toBeTruthy();
  expect(screen.getByText('sem preço coletado nesta região')).toBeTruthy();
});

it('mostra quanto veio da despensa', async () => {
  await montar(lista([item({ id: 'a', quantity: '0.700', quantity_from_pantry: '0.500' })]));

  expect(await screen.findByText('700 g')).toBeTruthy();
  expect(screen.getByText('500 g vieram da despensa')).toBeTruthy();
});

it('mantém na lista o item que a despensa cobriu por inteiro', async () => {
  await montar(
    lista([
      item({
        id: 'a',
        quantity: '0.000',
        quantity_from_pantry: '1.200',
        dispensed_by_pantry: true,
        estimated_cost: '0.00',
      }),
    ]),
  );

  // Sumir da tela esconderia uma decisão que o app tomou pelo usuário.
  expect(await screen.findByText('Peito de frango sem pele')).toBeTruthy();
  expect(screen.getByText('não precisa comprar')).toBeTruthy();
  expect(screen.getByText('1,2 kg já em casa')).toBeTruthy();
  expect(screen.getByText('1 item(ns) saíram da compra porque você já tem em casa.')).toBeTruthy();
});

it('marca produto fictício do seed', async () => {
  await montar(
    lista([item({ id: 'a', product: { ...produto('Arroz', 'mercearia'), is_fictitious: true } })]),
  );

  expect(await screen.findByText('dado fictício de desenvolvimento')).toBeTruthy();
});


// --------------------------------------------------------------------------
// item comprado
// --------------------------------------------------------------------------

it('conta os comprados pelo que veio do servidor, não pelo toque', async () => {
  await montar(
    lista([
      item({ id: 'a', purchased: true, purchased_at: HA_TRES_DIAS }),
      item({ id: 'b' }),
    ]),
  );

  // Marcado numa sessão anterior: sair da tela e voltar não perde o progresso.
  expect(await screen.findByText('1 de 2 itens comprados')).toBeTruthy();
});

it('marcar o item avisa o servidor', async () => {
  marcarItem.mockResolvedValue(item({ id: 'a', purchased: true }));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  await waitFor(() => expect(marcarItem).toHaveBeenCalledWith('lista-1', 'a', true));
});

it('desmarcar o item também avisa o servidor', async () => {
  marcarItem.mockResolvedValue(item({ id: 'a', purchased: false }));
  await montar(lista([item({ id: 'a', purchased: true, purchased_at: HA_TRES_DIAS })]));

  await fireEvent.press(await screen.findByText('Desmarcar'));

  await waitFor(() => expect(marcarItem).toHaveBeenCalledWith('lista-1', 'a', false));
});

it('risca o item na hora, sem esperar a resposta do servidor', async () => {
  // Quem usa isto está no corredor do mercado: o toque não pode parecer perdido.
  let responder: (valor: ShoppingListItem) => void = () => {};
  marcarItem.mockReturnValue(new Promise<ShoppingListItem>((ok) => (responder = ok)));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  // O servidor ainda não respondeu e o item já conta como comprado.
  expect(await screen.findByText('1 de 1 itens comprados')).toBeTruthy();

  // Encerrar a promessa antes do fim do teste: mutação pendente no teardown
  // deixa o Jest com um handle aberto e a atualização cai fora do `act`.
  responder(item({ id: 'a', purchased: true }));
  await waitFor(() => expect(lerLista).toHaveBeenCalledTimes(2));
});

it('desfaz a marcação quando o servidor recusa', async () => {
  marcarItem.mockRejectedValue(new Error('sem rede'));
  await montar(lista([item({ id: 'a' })]));

  await fireEvent.press(await screen.findByText('Já comprei'));

  // Contar como comprado algo que não foi salvo faria a pessoa sair do
  // mercado sem o item.
  expect(await screen.findByText('não foi possível salvar o item marcado')).toBeTruthy();
  expect(screen.getByText('0 de 1 itens comprados')).toBeTruthy();
});
