/**
 * Testes da conclusão da etapa Despensa.
 *
 * O que não pode falhar: a etapa só se cumpre quando a pessoa diz que terminou,
 * e a trilha (que lê a mesma chave do plano) muda sem esperar outra leitura.
 */

import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import * as api from "../../services/api";
import { usePantryReviewViewModel } from "../usePantryReviewViewModel";

jest.mock("../../services/api", () => ({
  ...jest.requireActual("../../services/api"),
  readMealPlan: jest.fn(),
  reviewPantry: jest.fn(),
}));

const lerPlano = api.readMealPlan as jest.Mock;
const revisarApi = api.reviewPantry as jest.Mock;

const CONCLUIDO_EM = "2026-10-28T10:00:00Z";

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
  lerPlano.mockResolvedValue({
    id: "plano-1",
    items: [],
    pantry_reviewed_at: null,
  });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

function montar(planId: string | null = "plano-1") {
  return renderHook(() => usePantryReviewViewModel(planId), {
    wrapper: Provedor,
  });
}

it("plano sem conclusão: etapa pendente", async () => {
  const { result } = await montar();

  await waitFor(() => expect(lerPlano).toHaveBeenCalledWith("plano-1"));
  expect(result.current.concluida).toBe(false);
  expect(result.current.temPlano).toBe(true);
});

it("concluir grava no servidor, atualiza o plano no cache e avisa quem chamou", async () => {
  revisarApi.mockResolvedValue({
    id: "plano-1",
    items: [],
    pantry_reviewed_at: CONCLUIDO_EM,
  });
  const onConcluida = jest.fn();
  const { result } = await montar();
  await waitFor(() => expect(lerPlano).toHaveBeenCalled());

  await act(async () => result.current.concluir(onConcluida));

  await waitFor(() => expect(result.current.concluida).toBe(true));
  expect(revisarApi).toHaveBeenCalledWith("plano-1");
  expect(onConcluida).toHaveBeenCalled();
  expect(
    cliente.getQueryData<{ pantry_reviewed_at: string }>([
      "meal-plan",
      "plano-1",
    ]),
  ).toEqual(expect.objectContaining({ pantry_reviewed_at: CONCLUIDO_EM }));
});

it("falha ao concluir vira mensagem e não avança", async () => {
  revisarApi.mockRejectedValue(new Error("fora do ar"));
  const onConcluida = jest.fn();
  const { result } = await montar();

  await act(async () => result.current.concluir(onConcluida));

  await waitFor(() =>
    expect(result.current.erro).toBe("não foi possível concluir a despensa"),
  );
  expect(onConcluida).not.toHaveBeenCalled();
  expect(result.current.concluida).toBe(false);
});

it("sem plano não há o que concluir", async () => {
  const { result } = await montar(null);

  await act(async () => result.current.concluir());

  expect(result.current.temPlano).toBe(false);
  expect(revisarApi).not.toHaveBeenCalled();
});
