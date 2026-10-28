/**
 * ViewModel do aviso de lista que ficou para trás do plano ou da despensa.
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
  despensa_alterada: 'despensa mudou',
};

/**
 * Título e explicação conforme o que divergiu.
 *
 * Quem só cadastrou algo na despensa não mexeu no plano; dizer "seu plano
 * mudou" mandaria a pessoa procurar na aba Dieta uma mudança que não fez.
 */
function textoDoAviso(itens: OutdatedItem[]): { titulo: string; explicacao: string } {
  const despensa = itens.some((item) => item.change === 'despensa_alterada');
  const plano = itens.some((item) => item.change !== 'despensa_alterada');

  if (despensa && !plano) {
    return {
      titulo: 'Sua despensa mudou depois desta lista',
      explicacao:
        'O desconto do que você tem em casa foi calculado com a despensa de antes. ' +
        'Gere de novo para usar a despensa de agora.',
    };
  }
  if (despensa) {
    return {
      titulo: 'Seu plano e sua despensa mudaram depois desta lista',
      explicacao:
        'A lista mostra o que estava confirmado e o que havia em casa quando foi gerada. ' +
        'Gere de novo para trazer o que mudou.',
    };
  }
  return {
    titulo: 'Seu plano mudou depois desta lista',
    explicacao:
      'A lista mostra o que estava confirmado quando foi gerada. ' +
      'Gere de novo para trazer o que você mudou na aba Dieta.',
  };
}

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
    ...textoDoAviso(lista.outdated_items),
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
