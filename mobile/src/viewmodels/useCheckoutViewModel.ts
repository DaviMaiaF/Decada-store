/**
 * ViewModel da finalização de compra — **simulada**.
 *
 * Confirmar marca como comprados os itens que faltavam. Nenhum pedido sai daqui:
 * a única chamada à API é a mesma do "Já comprei", item a item.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { setItemPurchased } from '../services/api';
import type { ShoppingList } from '../types/api';

export function useCheckoutViewModel(lista: ShoppingList) {
  const cliente = useQueryClient();
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
    // é lida de novo nos dois casos, e a trilha acompanha.
    onSettled: () => cliente.invalidateQueries({ queryKey: ['shopping-list', lista.id] }),
  });

  return {
    concluido,
    aComprar,
    semPreco,
    temFicticio,
    confirmar: () => confirmacao.mutate(),
    confirmando: confirmacao.isPending,
    falhou: confirmacao.isError,
  };
}
