/** Testes da lista de planos da nutricionista. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import NutritionistHomeScreen from '../NutritionistHomeScreen';
import * as api from '../../services/api';
import type { PrescriptionSummary } from '../../types/api';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readAccount: jest.fn(),
  readPrescriptions: jest.fn(),
}));

const mockSair = jest.fn();
jest.mock('../../services/auth', () => ({
  useAuth: () => ({ signOut: mockSair, signedIn: true, role: 'nutricionista' }),
}));

const lerConta = api.readAccount as jest.Mock;
const lerPlanos = api.readPrescriptions as jest.Mock;

function resumo(over: Partial<PrescriptionSummary> = {}): PrescriptionSummary {
  return {
    id: 'plano-1',
    title: 'Plano de outubro',
    patient_name: 'Paciente Fictícia',
    patient_email: 'paciente@example.com',
    status: 'enviada',
    sent_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    meal_count: 5,
    ...over,
  };
}

let cliente: QueryClient;
const onNew = jest.fn();
const onOpen = jest.fn();

async function montar(planos: PrescriptionSummary[]) {
  lerPlanos.mockResolvedValue(planos);
  await render(
    <QueryClientProvider client={cliente}>
      <NutritionistHomeScreen onNew={onNew} onOpen={onOpen} />
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

it('sem planos, explica as duas formas de entregar', async () => {
  await montar([]);

  expect(await screen.findByText('Você ainda não montou nenhum plano.')).toBeTruthy();
});

it('lista os planos com paciente e situação', async () => {
  await montar([resumo(), resumo({ id: 'plano-2', title: null, status: 'aceita' })]);

  expect(await screen.findByText('Plano de outubro')).toBeTruthy();
  expect(screen.getByText('enviado, aguardando o paciente')).toBeTruthy();
  // Sem título, o plano é chamado pelo nome do paciente.
  expect(screen.getByText('Plano de Paciente Fictícia')).toBeTruthy();
  expect(screen.getByText('aceito pelo paciente')).toBeTruthy();
  expect(screen.getAllByText('Paciente Fictícia · paciente@example.com · 5 refeições')).toHaveLength(
    2,
  );
});

it('abrir, criar e sair', async () => {
  await montar([resumo()]);

  await fireEvent.press(await screen.findByLabelText('Abrir Plano de outubro'));
  await fireEvent.press(screen.getByText('Novo plano'));
  await fireEvent.press(screen.getByText('Sair da conta'));

  expect(onOpen).toHaveBeenCalledWith('plano-1');
  expect(onNew).toHaveBeenCalled();
  expect(mockSair).toHaveBeenCalled();
});
