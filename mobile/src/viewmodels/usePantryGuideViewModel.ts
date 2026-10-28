/**
 * ViewModel do guia da despensa: "você tem isto em casa?", item a item, a partir
 * do plano alimentar confirmado.
 *
 * Cadastrar a despensa do zero é trabalhoso o bastante para a pessoa não fazer, e
 * ela só abate da lista se existir na hora de gerá-la. O plano já diz o que a
 * pessoa vai precisar, então o guia pergunta só por isso. Quem decide é ela
 * (decisão 11): "Tenho" grava o item, "Não tenho" só o tira da pergunta.
 *
 * O item entra vinculado ao produto confirmado e sem quantidade, como o da foto:
 * conta para as receitas na hora e só abate da compra depois que a pessoa disser
 * quanto tem.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, addPantryItem, readMealPlan, readPantry } from '../services/api';
import type { PantryItem, PlanItem } from '../types/api';

export function usePantryGuideViewModel(planId: string | null) {
  const cliente = useQueryClient();

  // Mesmas chaves do Navigator e da aba Despensa: nada de requisição extra.
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId!),
    enabled: planId !== null,
  });
  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });

  // Produtos que a pessoa disse não ter. Vale para a sessão: nada é gravado.
  const [semEsses, setSemEsses] = useState<Set<string>>(new Set());

  const guardar = useMutation({
    mutationFn: (item: PlanItem) =>
      addPantryItem({ raw_description: item.product!.name, product_id: item.product!.id }),
    onSuccess: (novo: PantryItem) => {
      cliente.setQueryData<PantryItem[]>(['pantry'], (atual) => [novo, ...(atual ?? [])]);
      cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    },
  });

  // Sem saber a despensa, perguntar de novo o que talvez já esteja nela seria ruído.
  const noCache = new Set(
    (despensa.data ?? []).flatMap((item) => (item.product ? [item.product.id] : [])),
  );
  const vistos = new Set<string>();
  const perguntas: PlanItem[] = [];
  if (despensa.isSuccess) {
    for (const item of plano.data?.items ?? []) {
      const produto = item.status === 'confirmado' ? item.product : null;
      if (!produto || vistos.has(produto.id)) continue;
      vistos.add(produto.id);
      if (!noCache.has(produto.id) && !semEsses.has(produto.id)) perguntas.push(item);
    }
  }

  return {
    perguntas,
    guardandoId: guardar.isPending ? (guardar.variables?.product_id ?? null) : null,
    erro: guardar.isError
      ? guardar.error instanceof ApiError
        ? guardar.error.message
        : 'não foi possível guardar o item'
      : null,
    tenho: (item: PlanItem) => guardar.mutate(item),
    naoTenho: (item: PlanItem) =>
      setSemEsses((atual) => new Set(atual).add(item.product!.id)),
  };
}
