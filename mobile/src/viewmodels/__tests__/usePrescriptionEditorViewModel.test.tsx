/**
 * Testes do ViewModel do editor de plano da nutricionista.
 *
 * Entregar sempre salva antes, plano aceito não muda mais (decisão 12) e o
 * formulário inválido não chega à API.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import { savePdf } from '../../services/download';
import type { Prescription } from '../../types/api';
import { usePrescriptionEditorViewModel } from '../usePrescriptionEditorViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  createPrescription: jest.fn(),
  updatePrescription: jest.fn(),
  deletePrescription: jest.fn(),
  sendPrescription: jest.fn(),
  downloadPrescriptionPdf: jest.fn(),
}));

jest.mock('../../services/download', () => ({ savePdf: jest.fn() }));

const criar = api.createPrescription as jest.Mock;
const atualizar = api.updatePrescription as jest.Mock;
const excluirApi = api.deletePrescription as jest.Mock;
const enviarApi = api.sendPrescription as jest.Mock;
const baixar = api.downloadPrescriptionPdf as jest.Mock;
const salvarPdf = savePdf as jest.Mock;

function plano(over: Partial<Prescription> = {}): Prescription {
  return {
    id: 'plano-1',
    title: 'Plano de outubro',
    patient_name: null,
    patient_email: null,
    notes: null,
    status: 'rascunho',
    sent_at: null,
    responded_at: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    meals: [
      {
        name: 'Almoço',
        time: '12:30:00',
        notes: null,
        items: [{ food: 'Arroz', household_measure: null, quantity: '150.000', unit: 'g' }],
        substitutions: [],
      },
    ],
    ...over,
  };
}

let cliente: QueryClient;
const onExcluido = jest.fn();

function Provedor({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}

async function montar(prescription: Prescription | null) {
  return renderHook(() => usePrescriptionEditorViewModel(prescription, onExcluido), {
    wrapper: Provedor,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

it('plano novo e vazio não chega à API: o erro de validação aparece', async () => {
  const { result } = await montar(null);

  await act(() => result.current.salvar());

  expect(result.current.erro).not.toBeNull();
  expect(criar).not.toHaveBeenCalled();
  expect(result.current.salvo).toBeNull();
});

it('plano salvo é atualizado, não criado de novo', async () => {
  atualizar.mockResolvedValue(plano({ title: 'Plano novo' }));
  const { result } = await montar(plano());

  await act(async () => result.current.mudarTitulo('Plano novo'));
  await act(() => result.current.salvar());

  expect(criar).not.toHaveBeenCalled();
  expect(atualizar).toHaveBeenCalledWith(
    'plano-1',
    expect.objectContaining({ title: 'Plano novo' }),
  );
  expect(result.current.aviso).toBe('Plano salvo.');
  expect(result.current.ocupado).toBeNull();
});

it('enviar sem e-mail pede o e-mail e não salva', async () => {
  const { result } = await montar(plano());

  await act(() => result.current.enviar());

  expect(result.current.erro).toBe('informe o e-mail do paciente');
  expect(atualizar).not.toHaveBeenCalled();
});

it('enviar salva antes e depois envia para o e-mail sem espaços', async () => {
  atualizar.mockResolvedValue(plano());
  enviarApi.mockResolvedValue(plano({ status: 'enviada', patient_email: 'ana@example.com' }));
  const { result } = await montar(plano());

  await act(async () => result.current.setEmail(' ana@example.com '));
  await act(() => result.current.enviar());

  expect(atualizar.mock.invocationCallOrder[0]).toBeLessThan(
    enviarApi.mock.invocationCallOrder[0],
  );
  expect(enviarApi).toHaveBeenCalledWith('plano-1', 'ana@example.com');
  expect(result.current.salvo?.status).toBe('enviada');
  expect(result.current.aviso).toMatch(/^Enviado para ana@example.com/);
});

it('plano aceito não é regravado; o PDF sai do que está no servidor', async () => {
  baixar.mockResolvedValue('blob');
  const { result } = await montar(plano({ status: 'aceita' }));

  expect(result.current.aceito).toBe(true);
  await act(() => result.current.baixarPdf());

  expect(atualizar).not.toHaveBeenCalled();
  expect(salvarPdf).toHaveBeenCalledWith('blob', 'plano-alimentar.pdf');
});

it('falha da API vira mensagem e libera o botão', async () => {
  atualizar.mockRejectedValue(new api.ApiError(409, 'plano já aceito'));
  const { result } = await montar(plano());

  await act(() => result.current.salvar());

  expect(result.current.erro).toBe('plano já aceito');
  expect(result.current.ocupado).toBeNull();
});

it('refeições: adiciona, e não deixa remover a última', async () => {
  const { result } = await montar(plano());
  expect(result.current.podeRemoverRefeicao).toBe(false);

  await act(async () => result.current.adicionarRefeicao());
  expect(result.current.form.meals).toHaveLength(2);
  expect(result.current.podeRemoverRefeicao).toBe(true);

  await act(async () => result.current.mudarRefeicao(1, { name: 'Jantar' }));
  expect(result.current.form.meals[1].name).toBe('Jantar');

  await act(async () => result.current.removerRefeicao(0));
  expect(result.current.form.meals.map((m) => m.name)).toEqual(['Jantar']);
});

it('excluir pede confirmação e, confirmado, apaga e avisa a tela', async () => {
  excluirApi.mockResolvedValue(undefined);
  const { result } = await montar(plano());

  await act(async () => result.current.pedirExclusao());
  expect(result.current.confirmandoExclusao).toBe(true);
  await act(async () => result.current.excluir());

  await waitFor(() => expect(onExcluido).toHaveBeenCalled());
  expect(excluirApi).toHaveBeenCalledWith('plano-1');
});
