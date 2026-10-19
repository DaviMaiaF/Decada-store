/**
 * Testes dos planos enviados pela nutricionista ao paciente.
 *
 * O que não pode falhar: nada é aceito sem o consentimento marcado (decisão 5),
 * e a pessoa consegue ler o plano inteiro, com as substituições, antes.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PlanosRecebidos } from '../PlanosRecebidos';
import * as api from '../../services/api';
import type { ImportResult, ReceivedPrescription } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(),
  acceptPrescription: jest.fn(),
  declinePrescription: jest.fn(),
}));

const lerRecebidos = api.readReceivedPrescriptions as jest.Mock;
const aceitar = api.acceptPrescription as jest.Mock;
const recusar = api.declinePrescription as jest.Mock;

const RECEBIDO: ReceivedPrescription = {
  id: 'plano-1',
  title: 'Plano de outubro',
  notes: 'Beba água.',
  sent_at: '2026-10-19T10:00:00Z',
  author: { full_name: 'Camila Fernandes', crn: 'CRN-3 48291' },
  meals: [
    {
      name: 'Café da manhã',
      time: '08:30:00',
      notes: null,
      items: [{ food: 'Pão francês', household_measure: '1 unidade', quantity: '50', unit: 'g' }],
      substitutions: [
        [{ food: 'Tapioca', household_measure: null, quantity: '35', unit: 'g' }],
      ],
    },
  ],
};

let cliente: QueryClient;
const onAccepted = jest.fn();

async function montar(recebidos: ReceivedPrescription[] = [RECEBIDO]) {
  lerRecebidos.mockResolvedValue(recebidos);
  await render(
    <QueryClientProvider client={cliente}>
      <PlanosRecebidos onAccepted={onAccepted} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { gcTime: 0 } },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('sem plano recebido não mostra nada', async () => {
  await montar([]);

  await waitFor(() => expect(lerRecebidos).toHaveBeenCalled());
  expect(screen.queryByText('Aceitar plano')).toBeNull();
});

it('mostra quem enviou e deixa ler o plano inteiro', async () => {
  await montar();

  expect(await screen.findByText('Plano de outubro')).toBeTruthy();
  expect(screen.getByText('Camila Fernandes · CRN-3 48291')).toBeTruthy();

  await fireEvent.press(screen.getByText('Ler o plano completo'));

  expect(screen.getByText('08:30 · Café da manhã')).toBeTruthy();
  expect(screen.getByText('Substituição 1')).toBeTruthy();
  expect(screen.getByText('Beba água.')).toBeTruthy();
});

it('sem o aceite marcado, não dá para aceitar', async () => {
  await montar();

  await fireEvent.press(await screen.findByText('Aceitar plano'));

  expect(aceitar).not.toHaveBeenCalled();
  expect(screen.getByText('Marque o aceite para usar este plano.')).toBeTruthy();
});

it('aceita com o consentimento e segue para o plano', async () => {
  const resultado = { meal_plan: { id: 'mp-1' } } as unknown as ImportResult;
  aceitar.mockResolvedValue(resultado);
  await montar();

  await fireEvent.press(
    await screen.findByLabelText('Aceito o tratamento do plano Plano de outubro'),
  );
  await fireEvent.press(screen.getByText('Aceitar plano'));

  await waitFor(() => expect(aceitar).toHaveBeenCalledWith('plano-1', true));
  await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(resultado));
});

it('recusa sem pedir consentimento', async () => {
  recusar.mockResolvedValue(undefined);
  await montar();

  await fireEvent.press(await screen.findByText('Recusar'));

  await waitFor(() => expect(recusar).toHaveBeenCalledWith('plano-1'));
  expect(onAccepted).not.toHaveBeenCalled();
});

it('mostra a recusa do servidor', async () => {
  aceitar.mockRejectedValue(new api.ApiError(404, 'plano não encontrado'));
  await montar();

  await fireEvent.press(
    await screen.findByLabelText('Aceito o tratamento do plano Plano de outubro'),
  );
  await fireEvent.press(screen.getByText('Aceitar plano'));

  expect(await screen.findByText('plano não encontrado')).toBeTruthy();
});
