/**
 * ViewModel da finalização de compra — **simulada**.
 *
 * Duas etapas: o resumo da compra e o pagamento, que imita o Mercado Pago
 * (`usePaymentViewModel`). Nada é cobrado e nenhum pedido sai daqui.
 *
 * Quando o pagamento é aprovado, os itens que faltavam são marcados como
 * comprados — a mesma chamada do "Já comprei", item a item — e a tela vai para
 * a conclusão.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { setItemPurchased } from '../services/api';
import type { ShoppingList } from '../types/api';
import { usePaymentViewModel } from './usePaymentViewModel';

/** Círculo (350 ms) + ✓ (250 ms) + folga da mola do pulo. */
const ESPERA_DA_ANIMACAO_MS = 900;

export type EtapaDoCheckout = 'resumo' | 'pagamento';

export function useCheckoutViewModel(lista: ShoppingList) {
  const cliente = useQueryClient();
  const [etapa, setEtapa] = useState<EtapaDoCheckout>('resumo');
  const [concluido, setConcluido] = useState(false);

  // Mesmo recorte da lista: o que a despensa dispensou não entra na compra.
  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const semPreco = aComprar.filter((item) => item.estimated_cost === null).length;
  const temFicticio = aComprar.some((item) => item.product.is_fictitious);

  // Só o que ainda não foi marcado: quem já riscou metade no corredor não
  // precisa de uma chamada repetida para cada item que já estava certo.
  const confirmacao = useMutation({
    mutationFn: () =>
      Promise.all(
        aComprar
          .filter((item) => !item.purchased)
          .map((item) => setItemPurchased(lista.id, item.id, true)),
      ),
    // Otimista: a tela de conclusão entra no toque, sem esperar uma chamada por
    // item. Se alguma falhar, a pessoa volta ao checkout com o erro à vista.
    onMutate: () => setConcluido(true),
    onError: () => setConcluido(false),
    // Mesmo com falha parcial, alguns itens podem ter sido gravados: a lista
    // é lida de novo nos dois casos, e a trilha acompanha. Na conclusão, a
    // leitura espera o ✓ terminar de se desenhar: a animação roda na thread JS,
    // e refazer a lista e a trilha no meio dela era a travada que se via.
    onSettled: (_dados, erro) => {
      const invalidar = () => cliente.invalidateQueries({ queryKey: ['shopping-list', lista.id] });
      if (erro) return invalidar();
      setTimeout(invalidar, ESPERA_DA_ANIMACAO_MS);
    },
  });

  const pagamento = usePaymentViewModel(lista, { onAprovado: () => confirmacao.mutate() });

  return {
    etapa,
    irParaPagamento: () => setEtapa('pagamento'),
    voltarAoResumo: () => setEtapa('resumo'),
    pagamento,

    concluido,
    aComprar,
    semPreco,
    temFicticio,
    /**
     * Marca os itens como comprados. Chamado sozinho pela aprovação; a tela só
     * o oferece depois de pago — na lista paga em outra visita, ou quando a
     * marcação falhou e precisa de outra tentativa.
     */
    confirmar: () => confirmacao.mutate(),
    confirmando: confirmacao.isPending,
    falhou: confirmacao.isError,
  };
}
