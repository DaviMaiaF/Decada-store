/**
 * Testes do ViewModel da confirmação item–produto.
 *
 * Decisão 4: o servidor sugere, quem confirma é a pessoa. O lote só aceita
 * sugestão que dá para confirmar de olhos fechados, e uma falha no lote não
 * derruba os outros itens.
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as api from '../../services/api';
import type { Candidate, MealPlan, PlanItem } from '../../types/api';
import {
  entraNoLote,
  useConfirmationViewModel,
  usePlanItemViewModel,
} from '../useConfirmationViewModel';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(),
  readMealPlan: jest.fn(),
  readCandidates: jest.fn(),
  confirmItem: jest.fn(),
}));

const lerRecebidos = api.readReceivedPrescriptions as jest.Mock;
const lerPlano = api.readMealPlan as jest.Mock;
const lerCandidatos = api.readCandidates as jest.Mock;
const confirmarApi = api.confirmItem as jest.Mock;

function item(over: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    position: 1,
    raw_description: '50 g de aveia em flocos',
    quantity: '50.000',
    unit: 'g',
    status: 'pendente',
    product_id: null,
    product: null,
    match_score: null,
    ...over,
  };
}

function plano(itens: PlanItem[]): MealPlan {
  return {
    id: 'plano-1',
    title: null,
    nutritionist_name: null,
    nutritionist_crn: null,
    consent_at: '2026-09-27T10:00:00Z',
    consent_version: 'v1',
    prescribed_meals: null,
    created_at: '2026-09-27T10:00:00Z',
    items: itens,
  };
}

function candidato(nome: string, over: Partial<Candidate> = {}): Candidate {
  return {
    product: {
      id: `produto-${nome}`,
      name: nome,
      brand: null,
      category: 'mercearia',
      base_unit: 'kg',
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    score: '0.90',
    unit_compatible: true,
    quantity_in_base: '0.050',
    packages_needed: 1,
    ...over,
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
  lerRecebidos.mockResolvedValue([]);
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

describe('entraNoLote', () => {
  it('só a sugestão de item pendente, na mesma unidade', () => {
    const boa = candidato('Aveia');

    expect(entraNoLote(item({ id: 'a' }), boa)).toBe(true);
    expect(entraNoLote(item({ id: 'a', status: 'nao_identificado' }), boa)).toBe(false);
    expect(entraNoLote(item({ id: 'a' }), candidato('Aveia', { unit_compatible: false }))).toBe(
      false,
    );
    expect(entraNoLote(item({ id: 'a' }), null)).toBe(false);
  });
});

describe('useConfirmationViewModel', () => {
  async function montar() {
    return renderHook(() => useConfirmationViewModel('plano-1'), { wrapper: Provedor });
  }

  it('conta confirmados e monta o lote só com as sugestões seguras', async () => {
    lerPlano.mockResolvedValue(
      plano([
        item({ id: 'a' }),
        item({ id: 'b', status: 'nao_identificado' }),
        item({ id: 'c', status: 'confirmado' }),
      ]),
    );
    lerCandidatos.mockResolvedValue([candidato('Aveia')]);
    const { result } = await montar();

    await waitFor(() => expect(result.current.tamanhoDoLote).toBe(1));
    expect(result.current.confirmados).toBe(1);
    expect(result.current.pendentes).toBe(2);
    expect(result.current.noLote('a')).toBe(true);
    expect(result.current.noLote('b')).toBe(false);
  });

  it('selecionar todos marca o lote inteiro, e de novo desmarca', async () => {
    lerPlano.mockResolvedValue(plano([item({ id: 'a' }), item({ id: 'b' })]));
    lerCandidatos.mockResolvedValue([candidato('Aveia')]);
    const { result } = await montar();
    await waitFor(() => expect(result.current.tamanhoDoLote).toBe(2));

    await act(async () => result.current.alternarTodos());
    expect(result.current.todosMarcados).toBe(true);
    expect(result.current.selecionados).toBe(2);

    await act(async () => result.current.alternarTodos());
    expect(result.current.selecionados).toBe(0);
  });

  it('no lote, a falha de um item fica marcada e as outras confirmações valem', async () => {
    lerPlano.mockResolvedValue(plano([item({ id: 'a' }), item({ id: 'b' })]));
    lerCandidatos.mockResolvedValue([candidato('Aveia')]);
    confirmarApi.mockImplementation((_plano: string, id: string) =>
      id === 'b' ? Promise.reject(new Error('fora do ar')) : Promise.resolve({}),
    );
    const { result } = await montar();
    await waitFor(() => expect(result.current.tamanhoDoLote).toBe(2));

    await act(async () => result.current.alternarTodos());
    await act(async () => result.current.confirmarSelecionados());

    await waitFor(() => expect(result.current.falhouNoLote('b')).toBe(true));
    expect(confirmarApi).toHaveBeenCalledWith('plano-1', 'a', 'produto-Aveia', '0.90');
    expect(result.current.falhouNoLote('a')).toBe(false);
    // Só o que falhou continua marcado, para tentar de novo.
    expect(result.current.marcado('b')).toBe(true);
    expect(result.current.marcado('a')).toBe(false);
  });

  it('avisa quando a nutricionista mandou um plano novo', async () => {
    lerPlano.mockResolvedValue(plano([]));
    lerRecebidos.mockResolvedValue([{ id: 'novo' }]);
    const { result } = await montar();

    await waitFor(() => expect(result.current.temPlanoNovo).toBe(true));
  });

  it('erro ao carregar o plano vira mensagem', async () => {
    lerPlano.mockRejectedValue(new api.ApiError(404, 'plano não encontrado'));
    const { result } = await montar();

    await waitFor(() => expect(result.current.erro).toBe('plano não encontrado'));
  });
});

describe('usePlanItemViewModel', () => {
  it('item pendente já traz a sugestão e confirma a escolhida', async () => {
    lerCandidatos.mockResolvedValue([candidato('Aveia'), candidato('Farelo')]);
    confirmarApi.mockResolvedValue({});
    const invalidar = jest.spyOn(cliente, 'invalidateQueries');
    const { result } = await renderHook(
      () => usePlanItemViewModel('plano-1', item({ id: 'a' })),
      { wrapper: Provedor },
    );
    await waitFor(() => expect(result.current.sugestao?.product.name).toBe('Aveia'));

    await act(async () => result.current.confirmar(result.current.candidatos![1]));

    await waitFor(() =>
      expect(confirmarApi).toHaveBeenCalledWith('plano-1', 'a', 'produto-Farelo', '0.90'),
    );
    await waitFor(() => expect(invalidar).toHaveBeenCalledWith({ queryKey: ['shopping-list'] }));
  });

  it('item confirmado só busca candidatos quando a pessoa abre a edição', async () => {
    lerCandidatos.mockResolvedValue([candidato('Aveia')]);
    const { result } = await renderHook(
      () => usePlanItemViewModel('plano-1', item({ id: 'a', status: 'confirmado' })),
      { wrapper: Provedor },
    );
    expect(lerCandidatos).not.toHaveBeenCalled();

    await act(async () => result.current.alternarAberto());

    await waitFor(() => expect(lerCandidatos).toHaveBeenCalledWith('plano-1', 'a'));
  });
});
