/**
 * ViewModel do aviso de lista que ficou para trás do plano.
 *
 * A lista não se corrige sozinha — o total deixaria de ser reproduzível, e as
 * marcações de "comprado" iriam junto —, então o aviso oferece gerar de novo,
 * na mesma região.
 */

import { useMutation } from '@tanstack/react-query';

import { ApiError, generateShoppingList } from '../services/api';
import type { OutdatedItem, PlanChange, ShoppingList } from '../types/api';

const MOTIVO: Record<PlanChange, string> = {
  produto_trocado: 'produto trocado',
  nao_confirmado: 'não está mais confirmado',
  novo_confirmado: 'confirmado depois da lista',
};

export function descreverDivergencia(item: OutdatedItem): string {
  return `${item.description} — ${MOTIVO[item.change]}`;
}

export function useOutdatedListViewModel(
  lista: ShoppingList,
  onGerada: (listId: string) => void,
) {
  const geracao = useMutation({
    mutationFn: () => generateShoppingList(lista.meal_plan_id, lista.state_code, lista.city),
    onSuccess: (resultado) => onGerada(resultado.shopping_list.id),
  });

  return {
    desatualizada: lista.outdated_items.length > 0,
    divergencias: lista.outdated_items.map((item) => ({
      id: item.plan_item_id,
      texto: descreverDivergencia(item),
    })),
    erro: geracao.isError
      ? geracao.error instanceof ApiError
        ? geracao.error.message
        : 'não foi possível gerar a lista'
      : null,
    gerando: geracao.isPending,
    gerar: () => geracao.mutate(),
  };
}
