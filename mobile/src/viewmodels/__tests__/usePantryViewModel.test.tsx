/**
 * Testes do ViewModel da Despensa.
 *
 * Os dois fluxos de formulário (adicionar e editar), os avisos do que um item
 * deixa de fazer, a recarga das receitas depois da foto e o cartão de receita.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { PantryItem, Product, RecipeAvailability, RecipeIngredient } from '../../types/api';
import {
  ESPERA_DAS_RECEITAS,
  enumerar,
  usePantryViewModel,
  useRecipeCardViewModel,
} from '../usePantryViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readPantry: jest.fn(),
  readRecipeSuggestions: jest.fn(),
  readShoppingList: jest.fn(),
  searchProducts: jest.fn(),
  addPantryItem: jest.fn(),
  updatePantryItem: jest.fn(),
  removePantryItem: jest.fn(),
  addExtraItem: jest.fn(),
}));

const lerDespensa = api.readPantry as jest.Mock;
const lerReceitas = api.readRecipeSuggestions as jest.Mock;
const lerLista = api.readShoppingList as jest.Mock;
const buscar = api.searchProducts as jest.Mock;
const adicionarApi = api.addPantryItem as jest.Mock;
const atualizarApi = api.updatePantryItem as jest.Mock;
const removerApi = api.removePantryItem as jest.Mock;
const extraApi = api.addExtraItem as jest.Mock;

function produto(nome: string, over: Partial<Product> = {}): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'mercearia',
    base_unit: 'kg',
    package_size: '1.000',
    package_unit: 'kg',
    is_fictitious: false,
    ...over,
  };
}

function item(over: Partial<PantryItem> & { id: string }): PantryItem {
  return { raw_description: 'arroz', product: null, quantity: null, unit: null, ...over };
}

function ingrediente(nome: string): RecipeIngredient {
  return { product: produto(nome), quantity: '0.200', unit: 'kg', optional: false };
}

function receita(missing: RecipeIngredient[]): RecipeAvailability {
  return {
    recipe: {
      id: 'r1',
      slug: 'r1',
      name: 'Arroz com feijão',
      servings: 2,
      prep_minutes: 30,
      instructions: null,
      is_fictitious: false,
      ingredients: [],
    },
    percentage: 50,
    complete: false,
    required_total: 2,
    required_available: 1,
    missing,
    missing_optional: [],
  };
}

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function montar(listId: string | null = null) {
  return renderHook(() => usePantryViewModel(listId), { wrapper: Provedor });
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  lerDespensa.mockResolvedValue([]);
  lerReceitas.mockResolvedValue([]);
  buscar.mockResolvedValue([{ product: produto('Arroz branco'), score: '0.9' }]);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('avisos da despensa', () => {
  it('conta os itens sem produto e os com produto mas sem quantidade', async () => {
    lerDespensa.mockResolvedValue([
      item({ id: 'a' }),
      item({ id: 'b', product: produto('Arroz') }),
      item({ id: 'c', product: produto('Feijão'), quantity: '1.000', unit: 'kg' }),
    ]);
    const { result } = await montar();

    await waitFor(() => expect(result.current.itens).toHaveLength(3));
    expect(result.current.semVinculo).toBe(1);
    expect(result.current.semQuantidade).toBe(1);
  });

  it('com lista, sabe quais produtos ela já tem', async () => {
    lerLista.mockResolvedValue({ items: [{ product: { id: 'produto-Feijão' } }] });
    const { result } = await montar('lista-1');

    await waitFor(() => expect(result.current.naLista.has('produto-Feijão')).toBe(true));
    expect(lerReceitas).toHaveBeenCalledWith('lista-1');
  });
});

describe('adicionar', () => {
  it('texto curto não começa a busca', async () => {
    const { result } = await montar();

    await act(async () => result.current.adicao.setTexto(' a '));

    expect(result.current.adicao.podeComecar).toBe(false);
    await act(async () => result.current.adicao.comecarEscolha());
    expect(result.current.adicao.escolhendo).toBeNull();
  });

  it('texto → produto → quantidade sugerida pela embalagem → salva o par', async () => {
    adicionarApi.mockResolvedValue({});
    const { result } = await montar();

    await act(async () => result.current.adicao.setTexto(' arroz '));
    await act(async () => result.current.adicao.comecarEscolha());
    expect(result.current.adicao.escolhendo).toBe('arroz');
    await waitFor(() => expect(result.current.adicao.candidatos).toHaveLength(1));

    await act(async () => result.current.adicao.escolherProduto(produto('Arroz branco')));
    expect(result.current.adicao.medindo?.produto.name).toBe('Arroz branco');
    expect(result.current.adicao.quantidade).toBe('1');
    expect(result.current.adicao.unidade).toBe('kg');

    await act(async () => result.current.adicao.salvarComQuantidade());

    await waitFor(() => expect(result.current.adicao.medindo).toBeNull());
    expect(adicionarApi).toHaveBeenCalledWith({
      raw_description: 'arroz',
      product_id: 'produto-Arroz branco',
      quantity: '1',
      unit: 'kg',
    });
    expect(result.current.adicao.texto).toBe('');
  });

  it('"não sei a quantidade" grava sem o par, e guardar só texto grava sem produto', async () => {
    adicionarApi.mockResolvedValue({});
    const { result } = await montar();
    await act(async () => result.current.adicao.setTexto('arroz'));
    await act(async () => result.current.adicao.comecarEscolha());
    await act(async () => result.current.adicao.escolherProduto(produto('Arroz branco')));

    await act(async () => result.current.adicao.salvarSemQuantidade());
    await waitFor(() => expect(adicionarApi).toHaveBeenCalledTimes(1));
    expect(adicionarApi).toHaveBeenLastCalledWith({
      raw_description: 'arroz',
      product_id: 'produto-Arroz branco',
    });

    await act(async () => result.current.adicao.setTexto('azeite da vó'));
    await act(async () => result.current.adicao.comecarEscolha());
    await act(async () => result.current.adicao.guardarSoTexto());
    await waitFor(() => expect(adicionarApi).toHaveBeenCalledTimes(2));
    expect(adicionarApi).toHaveBeenLastCalledWith({
      raw_description: 'azeite da vó',
      product_id: null,
    });
  });
});

describe('editar', () => {
  it('abre preenchido com a medição salva e fecha o fluxo de adicionar', async () => {
    const { result } = await montar();
    await act(async () => result.current.adicao.setTexto('arroz'));
    await act(async () => result.current.adicao.comecarEscolha());

    await act(async () =>
      result.current.edicao.abrir(
        item({ id: 'a', product: produto('Arroz'), quantity: '2.500', unit: 'kg' }),
      ),
    );

    expect(result.current.adicao.escolhendo).toBeNull();
    expect(result.current.edicao.quantidade).toBe('2,5');
    expect(result.current.edicao.unidade).toBe('kg');
  });

  it('campo vazio apaga a medição; texto que não é número é bloqueado', async () => {
    atualizarApi.mockResolvedValue({});
    const { result } = await montar();
    await act(async () =>
      result.current.edicao.abrir(
        item({ id: 'a', product: produto('Arroz'), quantity: '2.000', unit: 'kg' }),
      ),
    );

    await act(async () => result.current.edicao.setQuantidade('dois'));
    expect(result.current.edicao.medidaInvalida).toBe(true);

    await act(async () => result.current.edicao.setQuantidade(''));
    await act(async () => result.current.edicao.salvar());

    await waitFor(() => expect(result.current.edicao.editando).toBeNull());
    expect(atualizarApi).toHaveBeenCalledWith('a', {
      product_id: 'produto-Arroz',
      quantity: null,
      unit: null,
    });
  });

  it('vincular produto a item solto sugere a unidade dele', async () => {
    const { result } = await montar();
    await act(async () => result.current.edicao.abrir(item({ id: 'a' })));
    expect(result.current.edicao.produto).toBeNull();

    await act(async () =>
      result.current.edicao.escolherProduto(
        produto('Ovo', { base_unit: 'unidade', package_size: '12', package_unit: 'unidade' }),
      ),
    );

    expect(result.current.edicao.quantidade).toBe('12');
    expect(result.current.edicao.unidade).toBe('unidade');
  });
});

it('remover apaga o item pela API', async () => {
  removerApi.mockResolvedValue(undefined);
  const { result } = await montar();

  await act(async () => result.current.remover('a'));

  await waitFor(() => expect(removerApi).toHaveBeenCalledWith('a'));
});

it('item da foto entra no cache e as receitas recarregam uma vez só', async () => {
  jest.useFakeTimers();
  try {
    const { result } = await montar();
    await waitFor(() => expect(result.current.carregando).toBe(false));
    const invalidar = jest.spyOn(cliente, 'invalidateQueries');

    await act(async () => {
      result.current.guardadoPelaFoto(item({ id: 'f1', raw_description: 'banana' }));
      result.current.guardadoPelaFoto(item({ id: 'f2', raw_description: 'kiwi' }));
    });
    expect(result.current.itens.map((i) => i.id)).toEqual(['f2', 'f1']);
    expect(invalidar).not.toHaveBeenCalled();

    await act(async () => jest.advanceTimersByTime(ESPERA_DAS_RECEITAS));

    expect(invalidar).toHaveBeenCalledTimes(1);
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['recipe-suggestions'] });
  } finally {
    jest.useRealTimers();
  }
});

describe('useRecipeCardViewModel', () => {
  it('separa o que dá para acrescentar do que já está na lista', async () => {
    const { result } = await renderHook(
      () =>
        useRecipeCardViewModel(
          receita([ingrediente('Feijão'), ingrediente('Arroz'), ingrediente('Farofa')]),
          'lista-1',
          new Set(['produto-Arroz', 'produto-Farofa']),
        ),
      { wrapper: Provedor },
    );

    expect(result.current.acrescentaveis.map((i) => i.product.name)).toEqual(['Feijão']);
    expect(result.current.jaNaLista).toBe('Arroz e Farofa');
    expect(result.current.quantosJaNaLista).toBe(2);
  });

  it('acrescenta o que falta na quantidade da receita', async () => {
    extraApi.mockResolvedValue({});
    const feijao = ingrediente('Feijão');
    const { result } = await renderHook(
      () => useRecipeCardViewModel(receita([feijao]), 'lista-1', new Set()),
      { wrapper: Provedor },
    );

    await act(async () => result.current.acrescentar(feijao));

    await waitFor(() =>
      expect(extraApi).toHaveBeenCalledWith('lista-1', {
        product_id: 'produto-Feijão',
        quantity: '0.200',
        unit: 'kg',
      }),
    );
  });

  it('sem lista, não há onde acrescentar', async () => {
    const { result } = await renderHook(
      () => useRecipeCardViewModel(receita([ingrediente('Feijão')]), null, new Set()),
      { wrapper: Provedor },
    );

    expect(result.current.temLista).toBe(false);
  });
});

it('enumerar junta os nomes como se fala', () => {
  expect(enumerar(['arroz'])).toBe('arroz');
  expect(enumerar(['arroz', 'feijão'])).toBe('arroz e feijão');
  expect(enumerar(['arroz', 'feijão', 'farofa'])).toBe('arroz, feijão e farofa');
});
