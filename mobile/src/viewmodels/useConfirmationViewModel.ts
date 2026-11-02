/**
 * ViewModel da confirmação do casamento item–produto.
 *
 * O servidor sugere, mas quem decide qual produto atende ao item é a pessoa.
 * Aqui moram as duas formas de decidir: item a item (`usePlanItemViewModel`) e
 * em lote, só com as sugestões que dá para aceitar de olhos fechados.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  confirmItem,
  readCandidates,
  readMealPlan,
  readPlanCandidates,
  readReceivedPrescriptions,
  removePlanItem,
} from '../services/api';
import type { Candidate, ItemCandidates, PlanItem } from '../types/api';
import { RECEIVED_KEY } from './useReceivedPrescriptionsViewModel';

/**
 * Só entra no lote o item cuja sugestão dá para aceitar de olhos fechados: o
 * import o deixou "a confirmar" (sugestão acima do score mínimo), e ela mede na
 * mesma unidade da prescrição. Item "não encontrado" também tem candidatos, só
 * que fracos — no lote, viravam "Tapioca → Filé de tilápia" num toque só.
 * Esses, os de unidade diferente e os sem sugestão pedem o toque individual.
 */
export function entraNoLote(item: PlanItem, sugestao: Candidate | null): sugestao is Candidate {
  return item.status === 'pendente' && sugestao !== null && sugestao.unit_compatible;
}

function porItem(linhas: ItemCandidates[]): ReadonlyMap<string, Candidate[]> {
  return new Map(linhas.map((linha) => [linha.item_id, linha.candidates]));
}

/**
 * Os candidatos de todos os itens pendentes, numa requisição só.
 *
 * Eram uma por item, todas ao mesmo tempo: num plano de cem linhas o servidor
 * ficava sem conexão com o banco, parte voltava com erro, e o "x de N" do lote
 * contava as que tinham chegado até ali — subia, parava, pulava. A tela e cada
 * item leem esta mesma consulta, e o React Query faz uma busca só.
 *
 * Confirmar não a invalida: o item confirmado sai dos pendentes pelo plano, e
 * buscar o catálogo inteiro de novo a cada toque seria o mesmo custo de antes.
 */
function useCandidatosDoPlano(planId: string) {
  return useQuery({
    queryKey: ['plan-candidates', planId],
    queryFn: () => readPlanCandidates(planId),
    select: porItem,
    // A FlatList monta item conforme a rolagem, e cada item que monta depois de
    // uma falha buscaria tudo de novo. Quem tenta de novo é a pessoa, no botão.
    retryOnMount: false,
  });
}

/** Depois de confirmar, o plano é lido de novo e a lista já gerada fica para trás. */
function invalidarAposConfirmar(cliente: ReturnType<typeof useQueryClient>, planId: string) {
  cliente.invalidateQueries({ queryKey: ['meal-plan', planId] });
  // A lista já gerada não muda, mas passa a dizer que ficou para trás.
  cliente.invalidateQueries({ queryKey: ['shopping-list'] });
}

export function useConfirmationViewModel(planId: string) {
  const cliente = useQueryClient();
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId),
  });
  // Plano novo enviado pela nutricionista: a pessoa está aqui, no plano atual,
  // e não veria o aviso que fica na tela de envio.
  const recebidos = useQuery({ queryKey: RECEIVED_KEY, queryFn: readReceivedPrescriptions });
  const [planoAberto, setPlanoAberto] = useState(false);

  const itens = plano.data?.items ?? [];
  const pendentes = itens.filter((item) => item.status !== 'confirmado');

  // O lote só existe com a resposta inteira: montado aos pedaços, o "x de N"
  // mudava sozinho enquanto a pessoa lia.
  const doPlano = useCandidatosDoPlano(planId);

  const sugestoes = new Map<string, Candidate>();
  for (const item of pendentes) {
    const sugestao = doPlano.data?.get(item.id)?.[0] ?? null;
    if (entraNoLote(item, sugestao)) sugestoes.set(item.id, sugestao);
  }

  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [falhasDoLote, setFalhasDoLote] = useState<ReadonlySet<string>>(new Set());

  // Item que saiu do lote (confirmado, ou cuja sugestão mudou) deixa de contar
  // mesmo que a marca tenha ficado no estado.
  const selecionados = [...marcados].filter((id) => sugestoes.has(id));
  const todosMarcados = sugestoes.size > 0 && selecionados.length === sugestoes.size;

  const lote = useMutation({
    mutationFn: async (ids: string[]) => {
      // Uma chamada por item, e uma falha não derruba as outras: quem confirmou
      // dez de doze não precisa refazer as dez.
      const resultados = await Promise.allSettled(
        ids.map((id) => {
          const sugestao = sugestoes.get(id)!;
          return confirmItem(planId, id, sugestao.product.id, sugestao.score);
        }),
      );
      return ids.filter((_, indice) => resultados[indice].status === 'rejected');
    },
    onSuccess: (falhas) => {
      setFalhasDoLote(new Set(falhas));
      setMarcados(new Set(falhas));
    },
    onSettled: () => invalidarAposConfirmar(cliente, planId),
  });

  function alternar(id: string) {
    setMarcados((antes) => {
      const depois = new Set(antes);
      if (depois.has(id)) depois.delete(id);
      else depois.add(id);
      return depois;
    });
  }

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(sugestoes.keys()));
  }

  return {
    carregando: plano.isPending,
    /** Mensagem de erro ao carregar o plano, ou nulo. */
    erro: plano.isError
      ? plano.error instanceof ApiError
        ? plano.error.message
        : 'não foi possível carregar o plano'
      : null,
    itens,
    pendentes: pendentes.length,
    confirmados: itens.filter((item) => item.status === 'confirmado').length,
    temPlanoNovo: Boolean(recebidos.data?.length),
    refeicoes: plano.data?.prescribed_meals ?? null,
    planoAberto,
    alternarPlano: () => setPlanoAberto((a) => !a),

    buscandoSugestoes: doPlano.isPending,
    sugestoesFalharam: doPlano.isError,
    buscarSugestoesDeNovo: () => doPlano.refetch(),
    tamanhoDoLote: sugestoes.size,
    noLote: (id: string) => sugestoes.has(id),
    marcado: (id: string) => marcados.has(id),
    falhouNoLote: (id: string) => falhasDoLote.has(id),
    selecionados: selecionados.length,
    todosMarcados,
    alternar,
    alternarTodos,
    confirmarSelecionados: () => lote.mutate(selecionados),
    confirmandoLote: lote.isPending,
    /** Muda quando a seleção muda: a FlatList só redesenha as linhas com isto. */
    extraData: [marcados, falhasDoLote, sugestoes.size],
  };
}

/** Um item do plano: a sugestão, as outras opções e a confirmação individual. */
export function usePlanItemViewModel(planId: string, item: PlanItem) {
  // Em item pendente, abre as outras opções; em item confirmado, é a edição.
  const [aberto, setAberto] = useState(false);
  const cliente = useQueryClient();

  const confirmado = item.status === 'confirmado';

  // A sugestão chega com a do plano inteiro, assim que a tela abre: confirmar
  // um plano de 15 itens não pode pedir três toques em cada um. O item só busca
  // os próprios candidatos quando a pessoa abre a edição de um item já
  // confirmado, que não vem na resposta do plano.
  const doPlano = useCandidatosDoPlano(planId);
  const doLote = doPlano.data?.get(item.id);
  const proprios = useQuery({
    queryKey: ['candidates', planId, item.id],
    queryFn: () => readCandidates(planId, item.id),
    enabled: aberto && doLote === undefined,
  });
  const candidatos = doLote ?? proprios.data ?? null;
  // Fechado, quem busca é o plano; aberto sem o item no plano, é o item.
  const busca = aberto && doLote === undefined ? proprios : confirmado ? null : doPlano;

  const confirmacao = useMutation({
    mutationFn: ({ productId, score }: { productId: string; score: string | null }) =>
      confirmItem(planId, item.id, productId, score),
    onSuccess: () => {
      setAberto(false);
      invalidarAposConfirmar(cliente, planId);
    },
  });

  // Apagar não tem volta: o primeiro toque só pede a confirmação.
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const remocao = useMutation({
    mutationFn: () => removePlanItem(planId, item.id),
    onSuccess: () => invalidarAposConfirmar(cliente, planId),
  });

  return {
    aberto,
    confirmado,
    confirmandoRemocao,
    removendo: remocao.isPending,
    remocaoFalhou: remocao.isError,
    pedirRemocao: () => setConfirmandoRemocao(true),
    cancelarRemocao: () => setConfirmandoRemocao(false),
    remover: () => remocao.mutate(),
    sugestao: candidatos?.[0] ?? null,
    candidatos,
    buscando: candidatos === null && Boolean(busca?.isPending),
    buscaFalhou: candidatos === null && Boolean(busca?.isError),
    confirmando: confirmacao.isPending,
    confirmacaoFalhou: confirmacao.isError,
    alternarAberto: () => setAberto((estava) => !estava),
    confirmar: (candidato: Candidate) =>
      confirmacao.mutate({ productId: candidato.product.id, score: candidato.score }),
  };
}
