/**
 * ViewModel da conclusão da etapa Despensa.
 *
 * A etapa se cumpre quando a pessoa diz que terminou — pelo "Concluí a
 * despensa" da aba, ou pelo "Não tenho nada em casa" do Mercado. Ter algum item
 * na despensa não basta: a despensa é da conta, e itens de antes deste plano
 * deixavam a trilha verde sem a pessoa ter passado por lá.
 *
 * Fica no servidor (`pantry_reviewed_at`), e não só na tela, para valer depois
 * de fechar o app.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, readMealPlan, reviewPantry } from '../services/api';
import type { MealPlan } from '../types/api';

export function usePantryReviewViewModel(planId: string | null) {
  const cliente = useQueryClient();

  // Mesma chave do Navigator e do guia da despensa: a trilha muda junto.
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId!),
    enabled: planId !== null,
  });

  const conclusao = useMutation({
    mutationFn: () => reviewPantry(planId!),
    onSuccess: (atualizado: MealPlan) => cliente.setQueryData(['meal-plan', planId], atualizado),
  });

  return {
    /** Sem plano não há etapa a concluir. */
    temPlano: planId !== null,
    concluida: plano.data?.pantry_reviewed_at != null,
    concluindo: conclusao.isPending,
    erro: conclusao.isError
      ? conclusao.error instanceof ApiError
        ? conclusao.error.message
        : 'não foi possível concluir a despensa'
      : null,
    concluir: (onConcluida?: () => void) => {
      if (planId === null) return;
      conclusao.mutate(undefined, { onSuccess: () => onConcluida?.() });
    },
  };
}
