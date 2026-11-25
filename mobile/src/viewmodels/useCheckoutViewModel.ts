/**
 * ViewModel da finalização de compra — **simulada**.
 *
 * Duas etapas: o resumo da compra e o pagamento, que imita o Mercado Pago
 * (`usePaymentViewModel`). Nada é cobrado e nenhum pedido sai daqui.
 *
 * Com cenário simulado no Mercado, o checkout mostra e cobra esse cenário: o
 * item tirado fica fora da compra (e na lista, a comprar), e o item com outra
 * quantidade vale o custo que o servidor calculou para ela.
 *
 * Quando o pagamento é aprovado, os itens que faltavam são marcados como
 * comprados — a mesma chamada do "Já comprei", item a item — e a tela vai para
 * a conclusão.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { setItemPurchased } from '../services/api';
import {
  CENARIO_VAZIO,
  type CenarioDeCompra,
  cenarioVazio,
  simulatedTotal,
} from '../services/simulation';
import type { ShoppingList, ShoppingListItem } from '../types/api';
import { usePaymentViewModel } from './usePaymentViewModel';

/** Círculo (350 ms) + ✓ (250 ms) + folga da mola do pulo. */
const ESPERA_DA_ANIMACAO_MS = 900;

export type EtapaDoCheckout = 'resumo' | 'pagamento';

/** Um item da compra como o checkout mostra: com a quantidade e o custo simulados. */
export type ItemDoCheckout = ShoppingListItem & { simulado: boolean };

export function useCheckoutViewModel(
  lista: ShoppingList,
  cenario: CenarioDeCompra = CENARIO_VAZIO,
) {
  const cliente = useQueryClient();
  const [etapa, setEtapa] = useState<EtapaDoCheckout>('resumo');
  const [concluido, setConcluido] = useState(false);

  // Mesmo recorte da lista: o que a despensa dispensou não entra na compra, e o
  // que a pessoa tirou na simulação também não. Tirado não sai da lista: fica
  // nela, a comprar, e não é marcado como comprado.
  const excluidos = new Set(cenario.excluidos);
  const naLista = lista.items.filter((item) => !item.dispensed_by_pantry);
  const foraDaCompra = naLista.filter((item) => excluidos.has(item.id));
  const aComprar: ItemDoCheckout[] = naLista
    .filter((item) => !excluidos.has(item.id))
    .map((item) => {
      const simulado = cenario.quantidades[item.id];
      return simulado
        ? {
            ...item,
            quantity: simulado.quantity,
            estimated_cost: simulado.estimated_cost,
            simulado: true,
          }
        : { ...item, simulado: false };
    });
  // O mesmo valor que o servidor cobra: sem simulação, o total salvo da lista;
  // com ela, a soma do cenário, que o servidor refaz com o preço congelado.
  const simulando = !cenarioVazio(cenario);
  const total = simulando ? simulatedTotal(aComprar, new Set()) : lista.estimated_total;
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

  const pagamento = usePaymentViewModel(lista, {
    onAprovado: () => confirmacao.mutate(),
    cenario,
    total,
  });

  return {
    etapa,
    irParaPagamento: () => setEtapa('pagamento'),
    voltarAoResumo: () => setEtapa('resumo'),
    pagamento,

    concluido,
    aComprar,
    total,
    simulando,
    foraDaCompra: foraDaCompra.length,
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
