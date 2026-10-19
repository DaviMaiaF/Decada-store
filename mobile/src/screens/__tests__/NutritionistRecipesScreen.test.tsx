/** Testes da lista de receitas da nutricionista. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import NutritionistRecipesScreen from '../NutritionistRecipesScreen';
import * as api from '../../services/api';
import type { Recipe } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readAccount: jest.fn(),
  readOwnRecipes: jest.fn(),
}));

const mockSair = jest.fn();
jest.mock('../../services/auth', () => ({
  useAuth: () => ({ signOut: mockSair, signedIn: true, role: 'nutricionista' }),
}));

const lerConta = api.readAccount as jest.Mock;
const lerReceitas = api.readOwnRecipes as jest.Mock;

const OMELETE: Recipe = {
  id: 'receita-1',
  slug: 'omelete-ab12',
  name: 'Omelete de espinafre',
  servings: 2,
  prep_minutes: 10,
  instructions: null,
  is_fictitious: false,
  author: { full_name: 'Camila Fernandes', crn: 'CRN-3 48291' },
  ingredients: [
    {
      product: {
        id: 'p1',
        name: 'Ovos de galinha',
        brand: null,
        category: 'proteinas',
        base_unit: 'unidade',
        package_size: null,
        package_unit: null,
        is_fictitious: false,
      },
      quantity: '2',
      unit: 'unidade',
      optional: false,
    },
  ],
};

let cliente: QueryClient;
const onNew = jest.fn();
const onEdit = jest.fn();

async function montar(receitas: Recipe[]) {
  lerReceitas.mockResolvedValue(receitas);
  await render(
    <QueryClientProvider client={cliente}>
      <NutritionistRecipesScreen onNew={onNew} onEdit={onEdit} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  lerConta.mockResolvedValue({
    id: 'u1',
    email: 'camila@example.com',
    full_name: 'Camila Fernandes',
    role: 'nutricionista',
    crn: 'CRN-3 48291',
    created_at: '2026-10-19T10:00:00Z',
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('mostra a assinatura da nutricionista', async () => {
  await montar([]);

  expect(await screen.findByText('Camila Fernandes · CRN-3 48291')).toBeTruthy();
});

it('sem receitas, explica onde elas vão aparecer', async () => {
  await montar([]);

  expect(await screen.findByText('Você ainda não publicou nenhuma receita.')).toBeTruthy();
});

it('lista as receitas com o resumo de cada uma', async () => {
  await montar([OMELETE]);

  expect(await screen.findByText('Omelete de espinafre')).toBeTruthy();
  expect(screen.getByText('1 ingrediente · 10 minutos · rende 2')).toBeTruthy();
});

it('tocar na receita abre o editor com ela', async () => {
  await montar([OMELETE]);

  await fireEvent.press(await screen.findByLabelText('Editar Omelete de espinafre'));

  expect(onEdit).toHaveBeenCalledWith(OMELETE);
});

it('nova receita e sair da conta', async () => {
  await montar([]);

  await fireEvent.press(screen.getByText('Nova receita'));
  await fireEvent.press(screen.getByText('Sair da conta'));

  expect(onNew).toHaveBeenCalled();
  expect(mockSair).toHaveBeenCalled();
});
