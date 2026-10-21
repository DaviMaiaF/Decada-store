/** Testes do ViewModel do início da nutricionista. */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { PrescriptionSummary } from '../../types/api';
import { tituloDoPlano, useNutritionistHomeViewModel } from '../useNutritionistHomeViewModel';

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

function conta(crn: string | null) {
  return {
    id: 'u1',
    email: 'camila@example.com',
    full_name: 'Camila Fernandes',
    role: 'nutricionista',
    crn,
    created_at: '2026-10-19T10:00:00Z',
  };
}

let cliente: QueryClient;

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function montar() {
  return renderHook(() => useNutritionistHomeViewModel(), { wrapper: Provedor });
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  lerConta.mockResolvedValue(conta('CRN-3 48291'));
  lerPlanos.mockResolvedValue([]);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('assina com nome e CRN; sem CRN, só o nome', async () => {
  const comCrn = await montar();
  await waitFor(() => expect(comCrn.result.current.assinatura).toBe('Camila Fernandes · CRN-3 48291'));
  await comCrn.unmount();

  cliente.clear();
  lerConta.mockResolvedValue(conta(null));
  const semCrn = await montar();
  await waitFor(() => expect(semCrn.result.current.assinatura).toBe('Camila Fernandes'));
});

it('começa carregando e entrega os planos com título e detalhe prontos', async () => {
  lerPlanos.mockResolvedValue([resumo(), resumo({ id: 'plano-2', meal_count: 1, patient_email: null })]);
  const { result } = await montar();

  await waitFor(() => expect(result.current.carregando).toBe(false));
  expect(result.current.planos).toHaveLength(2);
  expect(result.current.planos![0].detalhe).toBe(
    'Paciente Fictícia · paciente@example.com · 5 refeições',
  );
  // Singular, e o e-mail ausente some em vez de deixar um "· ·".
  expect(result.current.planos![1].detalhe).toBe('Paciente Fictícia · 1 refeição');
});

it('falha ao listar vira erro', async () => {
  lerPlanos.mockRejectedValue(new Error('fora do ar'));
  const { result } = await montar();

  await waitFor(() => expect(result.current.falhou).toBe(true));
  expect(result.current.planos).toBeNull();
});

it('sair chama o signOut da sessão', async () => {
  const { result } = await montar();

  result.current.sair();

  expect(mockSair).toHaveBeenCalled();
});

describe('tituloDoPlano', () => {
  it('usa o título quando há', () => {
    expect(tituloDoPlano(resumo())).toBe('Plano de outubro');
  });

  it('sem título, chama pelo paciente', () => {
    expect(tituloDoPlano(resumo({ title: null }))).toBe('Plano de Paciente Fictícia');
  });

  it('sem título nem paciente, diz que não tem título', () => {
    expect(tituloDoPlano(resumo({ title: null, patient_name: null }))).toBe('Plano sem título');
  });
});
