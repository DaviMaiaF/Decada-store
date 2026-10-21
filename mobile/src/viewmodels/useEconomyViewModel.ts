/**
 * ViewModel da aba Economia.
 *
 * Lê a lista de compras e faz as contas que a tela mostra. Só há conta que o
 * servidor sabe sustentar: o total, o que já foi para o carrinho e o que a
 * despensa poupou.
 */

import { useQuery } from '@tanstack/react-query';

import { readShoppingList } from '../services/api';
import { useAuth } from '../services/auth';
import type { ShoppingList, ShoppingListItem } from '../types/api';

export type ResumoDaEconomia = {
  /** O que a despensa poupou, somado item a item. */
  economia: number;
  estimatedTotal: string | null;
  jaNoCarrinho: number;
  falta: number;
  percentual: number;
  comprados: number;
  aComprar: number;
  comPreco: number;
  semPreco: number;
  /** O item de selo mais fraco: é ele que diz a confiança da lista. */
  maisFraco: ShoppingListItem | null;
  ficticio: boolean;
  city: string;
  stateCode: string;
};

export type EstadoDaEconomia =
  | { estado: 'sem-lista' }
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; resumo: ResumoDaEconomia };

export function useEconomyViewModel(listId: string | null) {
  const { signOut } = useAuth();
  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  let conteudo: EstadoDaEconomia;
  if (listId === null) conteudo = { estado: 'sem-lista' };
  else if (lista.isPending) conteudo = { estado: 'carregando' };
  else if (lista.isError) conteudo = { estado: 'erro' };
  else conteudo = { estado: 'pronto', resumo: resumir(lista.data) };

  return { conteudo, sair: signOut };
}

export function resumir(lista: ShoppingList): ResumoDaEconomia {
  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const comprados = aComprar.filter((item) => item.purchased);

  const jaNoCarrinho = somar(comprados, 'estimated_cost');
  const total = Number(lista.estimated_total ?? 0);
  const comPreco = lista.items.filter((item) => item.estimated_cost !== null);

  return {
    economia: somar(lista.items, 'pantry_savings'),
    estimatedTotal: lista.estimated_total,
    jaNoCarrinho,
    falta: Math.max(total - jaNoCarrinho, 0),
    percentual: total === 0 ? 0 : (jaNoCarrinho / total) * 100,
    comprados: comprados.length,
    aComprar: aComprar.length,
    comPreco: comPreco.length,
    semPreco: lista.items.length - comPreco.length,
    // O selo mais fraco manda no aviso: dizer "atual" quando um item é estimativa
    // daria à lista inteira uma confiança que ela não tem.
    maisFraco: piorSelo(comPreco),
    ficticio: lista.items.some((item) => item.product.is_fictitious),
    city: lista.city,
    stateCode: lista.state_code,
  };
}

/** Soma os valores de uma coluna de dinheiro, ignorando o que não tem preço. */
function somar(itens: ShoppingListItem[], campo: 'estimated_cost' | 'pantry_savings'): number {
  return itens.reduce((total, item) => total + Number(item[campo] ?? 0), 0);
}

/** O item de selo mais fraco: estimativa perde de recente, que perde de atual. */
function piorSelo(itens: ShoppingListItem[]): ShoppingListItem | null {
  const ordem = ['atual', 'recente', 'estimativa'];
  let pior: ShoppingListItem | null = null;

  for (const item of itens) {
    if (item.price_confidence === null) continue;
    if (pior === null) pior = item;
    else if (ordem.indexOf(item.price_confidence) > ordem.indexOf(pior.price_confidence!)) {
      pior = item;
    }
  }

  return pior;
}
