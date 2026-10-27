/**
 * O cartão "Do seu plano": desenha a pergunta e repassa os toques ao ViewModel.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { DespensaDoPlano } from '../DespensaDoPlano';
import * as api from '../../services/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readMealPlan: jest.fn(),
  readPantry: jest.fn(),
  addPantryItem: jest.fn(),
}));

const arroz = {
  id: 'arroz',
  name: 'Arroz',
  brand: null,
  category: 'mercearia',
  base_unit: 'kg',
  package_size: null,
  package_unit: null,
  is_fictitious: false,
};

let cliente: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  (api.readPantry as jest.Mock).mockResolvedValue([]);
  (api.readMealPlan as jest.Mock).mockResolvedValue({
    id: 'plano-1',
    items: [{ id: 'i1', status: 'confirmado', product: arroz, product_id: 'arroz' }],
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('pergunta pelo item do plano e some quando a pessoa diz que não tem', async () => {
  await render(
    <QueryClientProvider client={cliente}>
      <DespensaDoPlano planId="plano-1" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Arroz')).toBeTruthy();
  await fireEvent.press(screen.getByText('Não tenho'));

  await waitFor(() => expect(screen.queryByText('Do seu plano')).toBeNull());
  expect(api.addPantryItem).not.toHaveBeenCalled();
});
