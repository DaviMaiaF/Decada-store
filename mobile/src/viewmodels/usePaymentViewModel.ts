/**
 * ViewModel do pagamento — **simulado**, no molde do Mercado Pago.
 *
 * Dois meios. O Pix nasce pendente, com o copia-e-cola, e só aprova quando a
 * pessoa toca em "simular pagamento recebido" — é o papel do aviso que o banco
 * mandaria. O cartão responde na hora, pelo titular de teste (`APRO` aprova,
 * `OTHE` recusa, `CONT` fica em análise).
 *
 * Recusado não é erro: é uma tentativa que deu "não", e a pessoa tenta de
 * novo. Erro é o que o servidor não aceitou (cartão inválido, lista já paga),
 * e vem com a mensagem dele.
 *
 * O que acontece depois da aprovação — marcar os itens como comprados, ir para
 * a conclusão — é de quem usa este hook, por `onAprovado`.
 */

import { useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, confirmPayment, payShoppingList, readPayments } from '../services/api';
import {
  FORMULARIO_VAZIO,
  type FormularioCartao,
  formatarNumeroCartao,
  formatarValidade,
  montarCartao,
} from '../services/payment';
import type { Payment, PaymentMethod, ShoppingList } from '../types/api';

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

/** Cada campo do formulário com a máscara que ele leva. */
const MASCARAS: Record<keyof FormularioCartao, (texto: string) => string> = {
  numero: formatarNumeroCartao,
  titular: (texto) => texto.slice(0, 60),
  validade: formatarValidade,
  cvv: (texto) => texto.replace(/\D/g, '').slice(0, 4),
};

export function usePaymentViewModel(
  lista: ShoppingList,
  { onAprovado }: { onAprovado?: (pagamento: Payment) => void } = {},
) {
  const cliente = useQueryClient();
  const chave = ['payments', lista.id];

  const [metodo, setMetodo] = useState<PaymentMethod>('pix');
  const [formulario, setFormulario] = useState<FormularioCartao>(FORMULARIO_VAZIO);
  // A tentativa em tela: o Pix esperando, o cartão recusado.
  const [atual, setAtual] = useState<Payment | null>(null);
  const [copiado, setCopiado] = useState(false);

  // O histórico diz se a lista já foi paga numa visita anterior.
  const historico = useQuery({ queryKey: chave, queryFn: () => readPayments(lista.id) });

  const aoResponder = (pagamento: Payment) => {
    setAtual(pagamento);
    setCopiado(false);
    cliente.invalidateQueries({ queryKey: chave });
    if (pagamento.status === 'aprovado') onAprovado?.(pagamento);
  };

  const cartao = montarCartao(formulario);

  const pagamento = useMutation({
    mutationFn: () =>
      payShoppingList(lista.id, metodo, metodo === 'cartao_credito' ? cartao! : undefined),
    onSuccess: aoResponder,
  });

  const recebimento = useMutation({
    mutationFn: (pagamentoId: string) => confirmPayment(lista.id, pagamentoId),
    onSuccess: aoResponder,
  });

  const pago =
    atual?.status === 'aprovado' ||
    (historico.data ?? []).some((tentativa) => tentativa.status === 'aprovado');
  const ocupado = pagamento.isPending || recebimento.isPending;
  const pendente = atual?.status === 'pendente' ? atual : null;

  const erroDoServidor = pagamento.isError
    ? mensagem(pagamento.error, 'não foi possível pagar; tente de novo')
    : recebimento.isError
      ? mensagem(recebimento.error, 'não foi possível confirmar o pagamento; tente de novo')
      : null;

  return {
    total: lista.estimated_total,
    metodo,
    /** Trocar de meio descarta a tentativa em tela: o Pix esperando não vale para o cartão. */
    escolherMetodo: (novo: PaymentMethod) => {
      if (novo === metodo) return;
      setMetodo(novo);
      setAtual(null);
      setCopiado(false);
      pagamento.reset();
      recebimento.reset();
    },

    formulario,
    alterarCampo: (campo: keyof FormularioCartao, texto: string) =>
      setFormulario((anterior) => ({ ...anterior, [campo]: MASCARAS[campo](texto) })),

    carregando: historico.isLoading,
    pago,
    /** Pix com o copia-e-cola, esperando o recebimento simulado. */
    pixPendente: pendente?.method === 'pix' ? pendente : null,
    /** Cartão `CONT`: em análise, também resolvido pelo recebimento simulado. */
    cartaoEmAnalise: pendente?.method === 'cartao_credito' ? pendente : null,
    recusa: atual?.status === 'recusado' ? (atual.status_detail ?? 'pagamento recusado') : null,
    erro: erroDoServidor,

    podePagar: !pago && !ocupado && !pendente && (metodo === 'pix' || cartao !== null),
    pagar: () => pagamento.mutate(),
    pagando: pagamento.isPending,

    /** Copia o código do Pix, como o botão "copiar" de qualquer app de banco. */
    copiarPix: async () => {
      if (pendente?.pix_code) {
        await Clipboard.setStringAsync(pendente.pix_code);
        setCopiado(true);
      }
    },
    copiado,

    simularRecebimento: () => {
      if (pendente) recebimento.mutate(pendente.id);
    },
    recebendo: recebimento.isPending,
  };
}
