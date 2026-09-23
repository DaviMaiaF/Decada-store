/**
 * Testes da despensa e das receitas.
 *
 * O ponto mais importante é o aviso do item não vinculado: sem ele a pessoa
 * cadastra "aveia", acha que descontou da compra, e não descontou.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import PantryScreen from '../PantryScreen';
import * as api from '../../services/api';
import type { PantryItem, Recipe, RecipeAvailability } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readPantry: jest.fn(),
  addPantryItem: jest.fn(),
  updatePantryItem: jest.fn(),
  removePantryItem: jest.fn(),
  readRecipeSuggestions: jest.fn(),
  searchProducts: jest.fn(),
}));

const lerDespensa = api.readPantry as jest.Mock;
const adicionar = api.addPantryItem as jest.Mock;
const atualizar = api.updatePantryItem as jest.Mock;
const remover = api.removePantryItem as jest.Mock;
const lerReceitas = api.readRecipeSuggestions as jest.Mock;
const buscarProdutos = api.searchProducts as jest.Mock;

function produto(nome: string) {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'mercearia',
    base_unit: 'kg' as const,
    package_size: null,
    package_unit: null,
    is_fictitious: false,
  };
}

function naDespensa(over: Partial<PantryItem> & { id: string }): PantryItem {
  return {
    raw_description: 'aveia em flocos',
    product: null,
    quantity: null,
    unit: null,
    ...over,
  };
}

function receita(over: Partial<Recipe> & { id: string }): Recipe {
  return {
    slug: 'panqueca',
    name: 'Panqueca de aveia e banana',
    servings: 2,
    prep_minutes: 10,
    instructions: 'Amasse a banana e misture com a aveia.',
    is_fictitious: true,
    ingredients: [],
    ...over,
  };
}

function disponibilidade(over: Partial<RecipeAvailability> = {}): RecipeAvailability {
  return {
    recipe: receita({ id: 'receita-1' }),
    percentage: 100,
    complete: true,
    required_total: 3,
    required_available: 3,
    missing: [],
    missing_optional: [],
    ...over,
  };
}

let cliente: QueryClient;

async function montar() {
  await render(
    <QueryClientProvider client={cliente}>
      <PantryScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  lerDespensa.mockResolvedValue([]);
  lerReceitas.mockResolvedValue([]);
  buscarProdutos.mockResolvedValue([
    { product: produto('Aveia em flocos'), score: '0.930' },
    { product: produto('Granola tradicional'), score: '0.640' },
  ]);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('despensa', () => {
  it('lista o que está em casa', async () => {
    lerDespensa.mockResolvedValue([
      naDespensa({ id: '1', raw_description: 'canela em pó' }),
      naDespensa({ id: '2', raw_description: 'ovos caipiras' }),
    ]);

    await montar();

    expect(await screen.findByText('canela em pó')).toBeTruthy();
    expect(screen.getByText('ovos caipiras')).toBeTruthy();
    expect(screen.getByText('2 itens')).toBeTruthy();
  });

  it('mostra a quantidade quando o item tem uma', async () => {
    lerDespensa.mockResolvedValue([
      naDespensa({
        id: '1',
        raw_description: 'aveia',
        product: produto('Aveia em flocos'),
        quantity: '0.300',
        unit: 'kg',
      }),
    ]);

    await montar();

    expect(await screen.findByText('aveia (300 g)')).toBeTruthy();
  });

  it('não adiciona texto vazio', async () => {
    await montar();

    await fireEvent.press(screen.getByLabelText('Adicionar à despensa'));

    expect(buscarProdutos).not.toHaveBeenCalled();
    expect(adicionar).not.toHaveBeenCalled();
  });

  it('remove um item', async () => {
    lerDespensa.mockResolvedValue([naDespensa({ id: '1', raw_description: 'canela em pó' })]);
    remover.mockResolvedValue(undefined);
    await montar();

    await fireEvent.press(await screen.findByLabelText('Remover canela em pó'));

    await waitFor(() => expect(remover).toHaveBeenCalledWith('1'));
  });

  it('avisa que item sem produto não desconta da compra', async () => {
    lerDespensa.mockResolvedValue([naDespensa({ id: '1', product: null })]);

    await montar();

    expect(
      await screen.findByText(
        '1 item ainda não foi ligado a um produto do mercado, então não desconta da sua lista de compras.',
      ),
    ).toBeTruthy();
  });

  it('não avisa quando todos os itens estão vinculados', async () => {
    lerDespensa.mockResolvedValue([
      naDespensa({ id: '1', product: produto('Aveia em flocos') }),
    ]);

    await montar();

    await screen.findByText('aveia em flocos');
    expect(screen.queryByText(/não desconta da sua lista/)).toBeNull();
  });

  it('explica a despensa vazia', async () => {
    await montar();

    expect(await screen.findByText(/Sua despensa está vazia/)).toBeTruthy();
  });
});

describe('vincular e medir item já salvo', () => {
  it('abre a edição ao tocar no item e permite salvar a medição', async () => {
    const itemSalvo = naDespensa({
      id: '10',
      raw_description: 'aveia',
      product: produto('Aveia em flocos'),
    });
    lerDespensa.mockResolvedValue([itemSalvo]);
    atualizar.mockResolvedValue(undefined);

    await montar();

    await fireEvent.press(await screen.findByLabelText('Item aveia'));

    expect(await screen.findByText('Medir ou vincular: "aveia"')).toBeTruthy();

    await fireEvent.changeText(screen.getByPlaceholderText('Quantidade'), '500');

    await fireEvent.press(screen.getByText('Salvar medição'));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith('10', {
        product_id: 'produto-Aveia em flocos',
        quantity: '500',
        unit: 'g',
      }),
    );
  });
});

describe('receitas', () => {
  it('mostra a receita que dá para fazer agora', async () => {
    lerReceitas.mockResolvedValue([disponibilidade()]);

    await montar();

    expect(await screen.findByText('Panqueca de aveia e banana')).toBeTruthy();
    expect(screen.getByText('100% disponível')).toBeTruthy();
    expect(screen.getByText('Dá para fazer com o que você já tem.')).toBeTruthy();
  });

  it('nomeia o que falta', async () => {
    lerReceitas.mockResolvedValue([
      disponibilidade({
        percentage: 85,
        complete: false,
        required_available: 2,
        missing: [
          { product: produto('Chia sementes'), quantity: '10', unit: 'g', optional: false },
        ],
      }),
    ]);

    await montar();

    expect(await screen.findByText('85% disponível')).toBeTruthy();
    expect(screen.getByText('Falta: Chia sementes')).toBeTruthy();
  });

  it('abre e fecha o modo de preparo', async () => {
    lerReceitas.mockResolvedValue([disponibilidade()]);
    await montar();

    await fireEvent.press(await screen.findByText('Ver modo de preparo'));
    expect(screen.getByText('Amasse a banana e misture com a aveia.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Ocultar preparo'));
    expect(screen.queryByText('Amasse a banana e misture com a aveia.')).toBeNull();
  });

  it('marca receita fictícia do seed', async () => {
    lerReceitas.mockResolvedValue([disponibilidade()]);

    await montar();

    expect(await screen.findByText('receita fictícia de desenvolvimento')).toBeTruthy();
  });
});

describe('escolher o produto ao adicionar', () => {
  async function digitarEAvancar(texto = 'aveia em flocos') {
    await montar();
    await fireEvent.changeText(screen.getByLabelText('Adicionar ingrediente'), texto);
    await fireEvent.press(screen.getByLabelText('Adicionar à despensa'));
  }

  it('busca candidatos no catálogo antes de salvar', async () => {
    await digitarEAvancar();

    await waitFor(() => expect(buscarProdutos).toHaveBeenCalledWith('aveia em flocos'));
    expect(await screen.findByText('Qual produto é "aveia em flocos"?')).toBeTruthy();
    expect(adicionar).not.toHaveBeenCalled();
  });

  it('salva com o produto escolhido', async () => {
    adicionar.mockResolvedValue(naDespensa({ id: '9' }));
    await digitarEAvancar();

    await fireEvent.press(await screen.findByLabelText('Usar Aveia em flocos'));

    await waitFor(() =>
      expect(adicionar).toHaveBeenCalledWith({
        raw_description: 'aveia em flocos',
        product_id: 'produto-Aveia em flocos',
      }),
    );
  });

  it('mostra o quanto cada candidato se parece', async () => {
    await digitarEAvancar();

    expect(await screen.findByText('93% de semelhança')).toBeTruthy();
    expect(screen.getByText('64% de semelhança')).toBeTruthy();
  });

  it('deixa guardar só como texto', async () => {
    adicionar.mockResolvedValue(naDespensa({ id: '9' }));
    await digitarEAvancar('canela em pó');

    await fireEvent.press(await screen.findByText('Guardar só como texto'));

    await waitFor(() =>
      expect(adicionar).toHaveBeenCalledWith({
        raw_description: 'canela em pó',
        product_id: null,
      }),
    );
  });

  it('cancela sem gravar nada', async () => {
    await digitarEAvancar();

    await fireEvent.press(await screen.findByText('Cancelar'));

    expect(screen.queryByText(/Qual produto é/)).toBeNull();
    expect(adicionar).not.toHaveBeenCalled();
  });

  it('avisa quando o catálogo não tem nada parecido', async () => {
    buscarProdutos.mockResolvedValue([]);
    await digitarEAvancar('suplemento xyz');

    expect(
      await screen.findByText('Nenhum produto do catálogo se parece com isso.'),
    ).toBeTruthy();
  });
});