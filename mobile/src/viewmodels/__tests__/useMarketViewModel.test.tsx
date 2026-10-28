/**
 * Testes dos ViewModels da aba Mercado.
 *
 * A região é lembrada e normalizada, a marcação é otimista e volta atrás se a
 * chamada falha, a simulação nunca toca a lista salva (decisão 8) e o item
 * avulso só entra com produto e quantidade.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import * as session from '../../services/session';
import type { Product, ShoppingList, ShoppingListItem } from '../../types/api';
import {
  descreverSimulacao,
  useAddExtraItemViewModel,
  useMarketViewModel,
  usePantryQuestionViewModel,
  useRegionFormViewModel,
  useShoppingListViewModel,
  useSimulatedQuantityField,
} from '../useMarketViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readShoppingList: jest.fn(),
  readPantry: jest.fn(),
  readMealPlan: jest.fn(),
  reviewPantry: jest.fn(),
  generateShoppingList: jest.fn(),
  setItemPurchased: jest.fn(),
  removeShoppingListItem: jest.fn(),
  simulateShoppingList: jest.fn(),
  searchProducts: jest.fn(),
  addExtraItem: jest.fn(),
}));

jest.mock('../../services/session', () => ({
  readRegion: jest.fn(),
  saveRegion: jest.fn(),
}));

const lerLista = api.readShoppingList as jest.Mock;
const lerDespensa = api.readPantry as jest.Mock;
const lerPlano = api.readMealPlan as jest.Mock;
const revisarApi = api.reviewPantry as jest.Mock;
const gerarApi = api.generateShoppingList as jest.Mock;
const marcarApi = api.setItemPurchased as jest.Mock;
const removerApi = api.removeShoppingListItem as jest.Mock;
const simularApi = api.simulateShoppingList as jest.Mock;
const buscarApi = api.searchProducts as jest.Mock;
const extraApi = api.addExtraItem as jest.Mock;
const lerRegiao = session.readRegion as jest.Mock;
const salvarRegiao = session.saveRegion as jest.Mock;

function produto(nome: string, categoria = 'mercearia'): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: categoria,
    base_unit: 'kg',
    package_size: '1.000',
    package_unit: 'kg',
    is_fictitious: false,
  };
}

function item(over: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    product: produto('Arroz'),
    quantity: '1.000',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: 1,
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
  lerRegiao.mockResolvedValue(null);
  salvarRegiao.mockResolvedValue(undefined);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('descreverSimulacao diz quantos itens saíram e o sinal da diferença', () => {
  expect(descreverSimulacao(0, '0.00')).toBe('Só mudando quantidades · mesmo custo');
  expect(descreverSimulacao(1, '-17.63')).toBe('1 item fora da simulação · R$ 17,63 a menos');
  expect(descreverSimulacao(2, '4.50')).toBe('2 itens fora da simulação · R$ 4,50 a mais');
});

describe('useMarketViewModel', () => {
  it('sem lista, mostra a região e não consulta a API', async () => {
    const { result } = await renderHook(() => useMarketViewModel(null), { wrapper: Provedor });
    expect(result.current.mostrarRegiao).toBe(true);
    expect(lerLista).not.toHaveBeenCalled();
  });

  it('com lista, carrega; trocar região e finalizar tomam a aba', async () => {
    lerLista.mockResolvedValue(lista([item({ id: 'a' })]));
    const { result } = await renderHook(() => useMarketViewModel('lista-1'), {
      wrapper: Provedor,
    });
    await waitFor(() => expect(result.current.lista).not.toBeNull());
    expect(result.current.mostrarRegiao).toBe(false);

    await act(async () => result.current.trocarRegiao());
    expect(result.current.mostrarRegiao).toBe(true);
    await act(async () => result.current.manterRegiao());
    expect(result.current.mostrarRegiao).toBe(false);

    await act(async () => result.current.finalizar());
    expect(result.current.finalizando).toBe(true);
    await act(async () => result.current.voltarALista());
    expect(result.current.finalizando).toBe(false);
  });
});

describe('useRegionFormViewModel', () => {
  it('começa na região lembrada', async () => {
    lerRegiao.mockResolvedValue({ stateCode: 'SP', city: 'Campinas' });
    const { result } = await renderHook(() => useRegionFormViewModel('plano-1', jest.fn()), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.city).toBe('Campinas'));
    expect(result.current.stateCode).toBe('SP');
  });

  it('normaliza, lembra a região e gera a lista nela', async () => {
    gerarApi.mockResolvedValue({ shopping_list: { id: 'lista-2' } });
    const onGerada = jest.fn();
    const { result } = await renderHook(() => useRegionFormViewModel('plano-1', onGerada), {
      wrapper: Provedor,
    });

    await act(async () => {
      result.current.setStateCode(' go ');
      result.current.setCity(' Goiânia ');
    });
    await act(async () => result.current.gerar());

    await waitFor(() => expect(onGerada).toHaveBeenCalledWith('lista-2'));
    expect(salvarRegiao).toHaveBeenCalledWith({ stateCode: 'GO', city: 'Goiânia' });
    expect(gerarApi).toHaveBeenCalledWith('plano-1', 'GO', 'Goiânia');
  });

  it('campos vazios voltam ao padrão em vez de gerar sem região', async () => {
    gerarApi.mockResolvedValue({ shopping_list: { id: 'lista-2' } });
    const { result } = await renderHook(() => useRegionFormViewModel('plano-1', jest.fn()), {
      wrapper: Provedor,
    });

    await act(async () => {
      result.current.setStateCode('  ');
      result.current.setCity('');
    });
    await act(async () => result.current.gerar());

    await waitFor(() => expect(gerarApi).toHaveBeenCalledWith('plano-1', 'DF', 'Brasília'));
  });
});

describe('useShoppingListViewModel', () => {
  async function montar(dados: ShoppingList) {
    // Sem tela observando, o gcTime 0 tiraria a lista do cache antes de o teste lê-la.
    cliente.setQueryDefaults(['shopping-list'], { gcTime: Infinity });
    cliente.setQueryData(['shopping-list', dados.id], dados);
    return renderHook(() => useShoppingListViewModel(dados), { wrapper: Provedor });
  }

  it('agrupa por corredor e conta só o que há para comprar', async () => {
    const { result } = await montar(
      lista([
        item({ id: 'a', product: produto('Banana', 'hortifruti'), purchased: true }),
        item({ id: 'b', product: produto('Arroz') }),
        item({ id: 'c', product: produto('Feijão'), dispensed_by_pantry: true }),
      ]),
    );

    expect(result.current.porCorredor.map(([categoria]) => categoria)).toEqual([
      'hortifruti',
      'mercearia',
    ]);
    expect(result.current.aComprar).toBe(2);
    expect(result.current.dispensados).toBe(1);
    expect(result.current.comprados).toBe(1);
    expect(result.current.progresso).toBe(50);
  });

  it('sem nenhum preço, a causa é a região', async () => {
    const { result } = await montar(
      lista([item({ id: 'a', estimated_cost: null }), item({ id: 'b', estimated_cost: null })]),
    );

    expect(result.current.semPrecoNaRegiao).toBe(true);
  });

  it('marcação que falha devolve a lista ao que era', async () => {
    marcarApi.mockRejectedValue(new Error('fora do ar'));
    lerLista.mockResolvedValue(lista([item({ id: 'a' })]));
    const { result } = await montar(lista([item({ id: 'a' })]));

    await act(async () => result.current.alternarComprado(item({ id: 'a' })));

    await waitFor(() => expect(result.current.marcacaoFalhou).toBe(true));
    expect(marcarApi).toHaveBeenCalledWith('lista-1', 'a', true);
    expect(
      cliente.getQueryData<ShoppingList>(['shopping-list', 'lista-1'])?.items[0].purchased,
    ).toBe(false);
  });

  it('simular sem um item muda o total na tela e não chama a API', async () => {
    const { result } = await montar(
      lista([
        item({ id: 'a', estimated_cost: '10.00' }),
        item({ id: 'b', estimated_cost: '20.00' }),
      ]),
    );

    await act(async () => result.current.alternarSimulacao('b'));

    expect(result.current.simulando).toBe(true);
    expect(result.current.foraDaSimulacao('b')).toBe(true);
    expect(result.current.totalSimulado).toBe('10.00');
    expect(result.current.totalOriginal).toBe('30.00');
    expect(result.current.resumoDaSimulacao).toBe('1 item fora da simulação · R$ 20,00 a menos');
    expect(marcarApi).not.toHaveBeenCalled();

    await act(async () => result.current.limparSimulacao());
    expect(result.current.simulando).toBe(false);
  });

  it('simular outra quantidade usa o custo que o servidor calculou', async () => {
    simularApi.mockResolvedValue([
      {
        item_id: 'a',
        quantity: '3.000',
        quantity_charged: '3.000',
        packages_needed: 3,
        estimated_cost: '30.00',
      },
    ]);
    const { result } = await montar(lista([item({ id: 'a', estimated_cost: '10.00' })]));

    await act(async () => result.current.simularQuantidade('a', '3'));

    await waitFor(() => expect(result.current.simulado('a')?.estimated_cost).toBe('30.00'));
    expect(simularApi).toHaveBeenCalledWith('lista-1', [{ item_id: 'a', quantity: '3' }]);
    expect(result.current.totalSimulado).toBe('30.00');
    expect(result.current.resumoDaSimulacao).toBe('Só mudando quantidades · R$ 20,00 a mais');
  });

  it('remover o avulso mostra o erro do servidor', async () => {
    removerApi.mockRejectedValue(new api.ApiError(404, 'item não encontrado'));
    const { result } = await montar(lista([item({ id: 'a', is_extra: true })]));

    await act(async () => result.current.remover('a'));

    await waitFor(() => expect(result.current.erroDaRemocao).toBe('item não encontrado'));
  });
});

describe('useSimulatedQuantityField', () => {
  it('abre o campo e só aceita número', async () => {
    const { result } = await renderHook(() => useSimulatedQuantityField());

    await act(async () => result.current.abrir());
    await act(async () => result.current.setQuantidade('abc'));
    expect(result.current.aberto).toBe(true);
    expect(result.current.numero).toBeNull();

    await act(async () => result.current.setQuantidade('1,5'));
    expect(result.current.numero).toBe('1.5');
  });
});

describe('useAddExtraItemViewModel', () => {
  it('busca, escolhe com a embalagem como palpite e acrescenta', async () => {
    buscarApi.mockResolvedValue([{ product: produto('Chia'), score: '0.9' }]);
    extraApi.mockResolvedValue({});
    const { result } = await renderHook(() => useAddExtraItemViewModel('lista-1'), {
      wrapper: Provedor,
    });

    await act(async () => result.current.setTexto('c'));
    expect(result.current.podeBuscar).toBe(false);
    await act(async () => result.current.setTexto(' chia '));
    await act(async () => result.current.buscar());
    await waitFor(() => expect(result.current.candidatos).toHaveLength(1));
    expect(buscarApi).toHaveBeenCalledWith('chia');

    await act(async () => result.current.escolherProduto(produto('Chia')));
    expect(result.current.quantidade).toBe('1');
    expect(result.current.unidade).toBe('kg');

    await act(async () => result.current.acrescentar());

    await waitFor(() => expect(result.current.produto).toBeNull());
    expect(extraApi).toHaveBeenCalledWith('lista-1', {
      product_id: 'produto-Chia',
      quantity: '1',
      unit: 'kg',
    });
    expect(result.current.texto).toBe('');
  });

  it('quantidade inválida não acrescenta', async () => {
    const { result } = await renderHook(() => useAddExtraItemViewModel('lista-1'), {
      wrapper: Provedor,
    });
    await act(async () => result.current.escolherProduto(produto('Chia')));
    await act(async () => result.current.setQuantidade('muito'));

    expect(result.current.quantidadeValida).toBe(false);
    await act(async () => result.current.acrescentar());
    expect(extraApi).not.toHaveBeenCalled();
  });
});

describe('usePantryQuestionViewModel', () => {
  beforeEach(() => {
    lerPlano.mockResolvedValue({ id: 'plano-1', items: [], pantry_reviewed_at: null });
    revisarApi.mockResolvedValue({
      id: 'plano-1',
      items: [],
      pantry_reviewed_at: '2026-10-28T10:00:00Z',
    });
  });

  it('despensa vazia: pergunta; "não tenho nada" vira aviso e conclui a etapa', async () => {
    lerDespensa.mockResolvedValue([]);
    const { result } = await renderHook(() => usePantryQuestionViewModel('plano-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.perguntar).toBe(true));
    expect(result.current.semDespensa).toBe(false);

    await act(async () => result.current.naoTenhoNada());

    expect(result.current.perguntar).toBe(false);
    expect(result.current.semDespensa).toBe(true);
    await waitFor(() => expect(revisarApi).toHaveBeenCalledWith('plano-1'));
  });

  it('quem já concluiu a despensa deste plano não é perguntado de novo', async () => {
    lerDespensa.mockResolvedValue([]);
    lerPlano.mockResolvedValue({
      id: 'plano-1',
      items: [],
      pantry_reviewed_at: '2026-10-28T10:00:00Z',
    });
    const { result } = await renderHook(() => usePantryQuestionViewModel('plano-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.semDespensa).toBe(true));
    expect(result.current.perguntar).toBe(false);
  });

  it('com itens, conta quantos e não pergunta', async () => {
    lerDespensa.mockResolvedValue([
      { id: 'p1', raw_description: 'arroz', product: null, quantity: null, unit: null },
    ]);
    const { result } = await renderHook(() => usePantryQuestionViewModel('plano-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(result.current.total).toBe(1));
    expect(result.current.perguntar).toBe(false);
  });

  it('se a despensa não carrega, não pergunta nem avisa', async () => {
    lerDespensa.mockRejectedValue(new Error('rede'));
    const { result } = await renderHook(() => usePantryQuestionViewModel('plano-1'), {
      wrapper: Provedor,
    });

    await waitFor(() => expect(lerDespensa).toHaveBeenCalled());
    expect(result.current.perguntar).toBe(false);
    expect(result.current.semDespensa).toBe(false);
  });
});
