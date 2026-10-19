/**
 * Testes do editor de receita da nutricionista.
 *
 * O caminho principal: buscar o produto, dar a quantidade e publicar. E o que a
 * tela não pode deixar passar: ingrediente repetido, receita inválida indo à
 * rede, exclusão sem confirmação.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import RecipeEditorScreen from '../RecipeEditorScreen';
import * as api from '../../services/api';
import type { Product, Recipe } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  searchProducts: jest.fn(),
  createRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  deleteRecipe: jest.fn(),
}));

const buscar = api.searchProducts as jest.Mock;
const criar = api.createRecipe as jest.Mock;
const atualizar = api.updateRecipe as jest.Mock;
const excluir = api.deleteRecipe as jest.Mock;

function produto(nome: string, over: Partial<Product> = {}): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'mercearia',
    base_unit: 'kg',
    package_size: null,
    package_unit: null,
    is_fictitious: false,
    ...over,
  };
}

const OVOS = produto('Ovos de galinha', { base_unit: 'unidade' });
const AVEIA = produto('Aveia em flocos');

const SALVA: Recipe = {
  id: 'receita-1',
  slug: 'omelete-ab12',
  name: 'Omelete',
  servings: 1,
  prep_minutes: 10,
  instructions: 'Bata os ovos.',
  is_fictitious: false,
  author: { full_name: 'Camila Fernandes', crn: 'CRN-3 48291' },
  ingredients: [{ product: OVOS, quantity: '2.000', unit: 'unidade', optional: false }],
};

let cliente: QueryClient;
const onDone = jest.fn();

async function montar(recipe: Recipe | null = null) {
  await render(
    <QueryClientProvider client={cliente}>
      <RecipeEditorScreen recipe={recipe} onDone={onDone} />
    </QueryClientProvider>,
  );
}

async function adicionarPelaBusca(termo: string, nome: string) {
  await fireEvent.changeText(screen.getByLabelText('Buscar produto'), termo);
  await fireEvent.press(await screen.findByLabelText(`Adicionar ${nome}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
  buscar.mockImplementation(async (termo: string) =>
    [OVOS, AVEIA]
      .filter((p) => p.name.toLowerCase().includes(termo.toLowerCase()))
      .map((product) => ({ product, score: '0.9' })),
  );
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('publica uma receita nova com o produto escolhido na busca', async () => {
  criar.mockResolvedValue(SALVA);
  await montar();

  await fireEvent.changeText(screen.getByLabelText('Nome da receita'), 'Mingau');
  await adicionarPelaBusca('aveia', 'Aveia em flocos');
  await fireEvent.changeText(screen.getByLabelText('Quantidade de Aveia em flocos'), '40');
  await fireEvent.press(screen.getByText('Publicar receita'));

  await waitFor(() =>
    expect(criar).toHaveBeenCalledWith({
      name: 'Mingau',
      instructions: null,
      servings: null,
      prep_minutes: null,
      ingredients: [
        { product_id: AVEIA.id, quantity: '40', unit: 'g', optional: false },
      ],
    }),
  );
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

it('só oferece as unidades da grandeza do produto', async () => {
  await montar();

  await adicionarPelaBusca('aveia', 'Aveia em flocos');

  expect(screen.getByLabelText('Unidade g')).toBeTruthy();
  expect(screen.getByLabelText('Unidade kg')).toBeTruthy();
  expect(screen.queryByLabelText('Unidade ml')).toBeNull();
});

it('produto já na receita some da busca', async () => {
  await montar(SALVA);

  await fireEvent.changeText(screen.getByLabelText('Buscar produto'), 'ovos');

  expect(await screen.findByText('Nenhum produto novo com esse nome no catálogo.')).toBeTruthy();
  expect(screen.queryByLabelText('Adicionar Ovos de galinha')).toBeNull();
});

it('receita inválida não vai à rede e diz o motivo', async () => {
  await montar();

  await fireEvent.changeText(screen.getByLabelText('Nome da receita'), 'Mingau');
  await fireEvent.press(screen.getByText('Publicar receita'));

  expect(await screen.findByText('adicione pelo menos um ingrediente')).toBeTruthy();
  expect(criar).not.toHaveBeenCalled();
});

it('mostra a recusa do servidor', async () => {
  criar.mockRejectedValue(new api.ApiError(422, 'produto não está no catálogo'));
  await montar();

  await fireEvent.changeText(screen.getByLabelText('Nome da receita'), 'Mingau');
  await adicionarPelaBusca('aveia', 'Aveia em flocos');
  await fireEvent.changeText(screen.getByLabelText('Quantidade de Aveia em flocos'), '40');
  await fireEvent.press(screen.getByText('Publicar receita'));

  expect(await screen.findByText('produto não está no catálogo')).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
});

it('edita a receita salva, com os campos já preenchidos', async () => {
  atualizar.mockResolvedValue(SALVA);
  await montar(SALVA);

  expect(screen.getByDisplayValue('Omelete')).toBeTruthy();
  expect(screen.getByDisplayValue('2')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Ovos de galinha é opcional'));
  await adicionarPelaBusca('aveia', 'Aveia em flocos');
  await fireEvent.changeText(screen.getByLabelText('Quantidade de Aveia em flocos'), '30');
  await fireEvent.press(screen.getByText('Salvar alterações'));

  await waitFor(() =>
    expect(atualizar).toHaveBeenCalledWith('receita-1', {
      name: 'Omelete',
      instructions: 'Bata os ovos.',
      servings: 1,
      prep_minutes: 10,
      ingredients: [
        { product_id: OVOS.id, quantity: '2', unit: 'unidade', optional: true },
        { product_id: AVEIA.id, quantity: '30', unit: 'g', optional: false },
      ],
    }),
  );
});

it('remove um ingrediente', async () => {
  await montar(SALVA);

  await fireEvent.press(screen.getByLabelText('Remover Ovos de galinha'));

  expect(screen.queryByText('Ovos de galinha')).toBeNull();
});

it('excluir pede confirmação antes de apagar', async () => {
  excluir.mockResolvedValue(undefined);
  await montar(SALVA);

  await fireEvent.press(screen.getByText('Excluir receita'));
  expect(excluir).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText('Confirmar exclusão'));

  await waitFor(() => expect(excluir).toHaveBeenCalledWith('receita-1'));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

it('receita nova não tem botão de excluir', async () => {
  await montar();

  expect(screen.queryByText('Excluir receita')).toBeNull();
});
