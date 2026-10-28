/**
 * ViewModel da aba Mercado: a lista de compras, a região dos preços, a
 * simulação e o item avulso.
 *
 * A tela tem quatro partes com estado próprio, e cada uma tem o seu hook:
 * a aba em si (`useMarketViewModel`), a pergunta da despensa
 * (`usePantryQuestionViewModel`), o formulário de região
 * (`useRegionFormViewModel`), a lista carregada (`useShoppingListViewModel`) e
 * o acréscimo de item avulso (`useAddExtraItemViewModel`).
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  addExtraItem,
  generateShoppingList,
  readPantry,
  readShoppingList,
  removeShoppingListItem,
  searchProducts,
  setItemPurchased,
  simulateShoppingList,
} from '../services/api';
import { formatMoney } from '../services/format';
import { readRegion, saveRegion } from '../services/session';
import { simulatedDifference, simulatedTotal } from '../services/simulation';
import { parseDecimal, suggestedAmount } from '../services/units';
import { usePantryReviewViewModel } from './usePantryReviewViewModel';
import type {
  MeasurementUnit,
  Product,
  ShoppingList,
  ShoppingListItem,
  SimulatedItem,
} from '../types/api';

// Região padrão enquanto a pessoa não escolhe outra.
const UF_PADRAO = 'DF';
const CIDADE_PADRAO = 'Brasília';

// Uma letra devolveria o catálogo inteiro.
const BUSCA_MINIMA = 2;

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

/** Qual das três telas da aba aparece: região, lista ou checkout. */
export function useMarketViewModel(listId: string | null) {
  // Depois de gerada, a lista tomava a tela para sempre e a região virava
  // definitiva — inclusive para quem lia o aviso de região sem preço, que manda
  // justamente gerar em outra cidade. Conselho sem caminho não é conselho.
  const [trocandoRegiao, setTrocandoRegiao] = useState(false);
  // Checkout simulado: toma a aba até a pessoa voltar à lista.
  const [finalizando, setFinalizando] = useState(false);

  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  return {
    /** Sem lista, ou trocando a região: o formulário toma a aba. */
    mostrarRegiao: listId === null || trocandoRegiao,
    trocandoRegiao,
    finalizando,
    carregando: lista.isPending,
    falhou: lista.isError,
    lista: lista.data ?? null,
    trocarRegiao: () => setTrocandoRegiao(true),
    manterRegiao: () => setTrocandoRegiao(false),
    finalizar: () => setFinalizando(true),
    voltarALista: () => setFinalizando(false),
  };
}

/**
 * O que há em casa, perguntado antes de gerar a lista.
 *
 * A despensa é descontada quando a lista é gerada, e a lista fica congelada: quem
 * gera com a despensa vazia leva a compra inteira. Por isso a pergunta vem antes,
 * mas não trava — "não tenho nada" e simplesmente gerar são respostas válidas.
 * "Não tenho nada" conclui a etapa Despensa da trilha, como o botão da aba.
 * Lê a mesma chave da aba Despensa, então cadastrar lá aparece aqui na volta.
 */
export function usePantryQuestionViewModel(planId: string | null) {
  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });
  const revisao = usePantryReviewViewModel(planId);
  const [respondeuAgora, setRespondeuAgora] = useState(false);
  // A resposta vale para o plano, não só para a tela: quem já disse "não tenho
  // nada" não é perguntado de novo ao reabrir o app.
  const semNada = respondeuAgora || revisao.concluida;

  const total = despensa.data?.length ?? 0;
  // Sem saber a despensa (carregando ou erro), não há o que perguntar nem avisar.
  const sabe = despensa.isSuccess;

  return {
    total,
    /** Despensa vazia e a pessoa ainda não respondeu. */
    perguntar: sabe && total === 0 && !semNada,
    /** Respondeu que não tem nada: a lista sai com a compra inteira. */
    semDespensa: sabe && total === 0 && semNada,
    /** Também conclui a etapa Despensa da trilha: a pessoa respondeu. */
    naoTenhoNada: () => {
      setRespondeuAgora(true);
      revisao.concluir();
    },
  };
}

/** UF e cidade, lembradas entre sessões, e a geração da lista nelas. */
export function useRegionFormViewModel(planId: string, onGerada: (listId: string) => void) {
  const [stateCode, setStateCode] = useState(UF_PADRAO);
  const [city, setCity] = useState(CIDADE_PADRAO);

  useEffect(() => {
    let ativo = true;
    readRegion().then((regiao) => {
      if (ativo && regiao) {
        setStateCode(regiao.stateCode);
        setCity(regiao.city);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  const geracao = useMutation({
    mutationFn: async () => {
      const ufLimpa = stateCode.trim().toUpperCase() || UF_PADRAO;
      const cidadeLimpa = city.trim() || CIDADE_PADRAO;
      await saveRegion({ stateCode: ufLimpa, city: cidadeLimpa });
      return generateShoppingList(planId, ufLimpa, cidadeLimpa);
    },
    onSuccess: (resultado) => onGerada(resultado.shopping_list.id),
  });

  return {
    stateCode,
    city,
    setStateCode,
    setCity,
    gerando: geracao.isPending,
    erro: geracao.isError ? mensagem(geracao.error, 'não foi possível gerar a lista') : null,
    gerar: () => geracao.mutate(),
  };
}

/** "2 itens fora da simulação · R$ 17,63 a menos", com o sinal certo. */
export function descreverSimulacao(fora: number, diferenca: string): string {
  const centavos = Math.round(Number(diferenca) * 100);
  const valor =
    centavos === 0
      ? 'mesmo custo'
      : `${formatMoney(Math.abs(centavos / 100).toFixed(2))} a ${centavos < 0 ? 'menos' : 'mais'}`;

  if (fora === 0) return `Só mudando quantidades · ${valor}`;
  if (fora === 1) return `1 item fora da simulação · ${valor}`;
  return `${fora} itens fora da simulação · ${valor}`;
}

/** A lista carregada: corredores, marcação, remoção do avulso e simulação. */
export function useShoppingListViewModel(lista: ShoppingList) {
  const cliente = useQueryClient();
  const chave = ['shopping-list', lista.id];

  /**
   * Marcar item é otimista de propósito.
   *
   * Quem usa isto está de pé no corredor do mercado, com a rede do celular
   * oscilando. Esperar a resposta para riscar a linha faria o toque parecer
   * perdido. Se a chamada falhar, a lista volta ao que era e a mensagem de
   * erro aparece.
   */
  const marcacao = useMutation({
    mutationFn: ({ itemId, comprado }: { itemId: string; comprado: boolean }) =>
      setItemPurchased(lista.id, itemId, comprado),
    onMutate: async ({ itemId, comprado }) => {
      await cliente.cancelQueries({ queryKey: chave });
      const anterior = cliente.getQueryData<ShoppingList>(chave);

      cliente.setQueryData<ShoppingList>(chave, (atual) =>
        atual === undefined
          ? atual
          : {
              ...atual,
              items: atual.items.map((item) =>
                item.id === itemId ? { ...item, purchased: comprado } : item,
              ),
            },
      );

      return { anterior };
    },
    onError: (_erro, _variaveis, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(chave, contexto.anterior);
    },
    onSettled: () => cliente.invalidateQueries({ queryKey: chave }),
  });

  /**
   * Tirar da lista só vale para o item avulso.
   *
   * Não é otimista como a marcação: remover é destrutivo, e a linha some da
   * tela só quando o servidor confirmou que sumiu do banco.
   */
  const remocao = useMutation({
    mutationFn: (itemId: string) => removeShoppingListItem(lista.id, itemId),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: chave });
      // Um ingrediente a menos na compra muda a disponibilidade das receitas.
      cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    },
  });

  /** Agrupado aqui, e não no servidor: como exibir é decisão de quem exibe. */
  const porCorredor = useMemo(() => {
    const grupos = new Map<string, ShoppingListItem[]>();
    for (const item of lista.items) {
      const categoria = item.product.category ?? 'outros';
      grupos.set(categoria, [...(grupos.get(categoria) ?? []), item]);
    }
    return [...grupos.entries()];
  }, [lista.items]);

  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const dispensados = lista.items.filter((item) => item.dispensed_by_pantry);
  // Só conta entre o que há para comprar: item que a despensa dispensou aceita
  // marcação no servidor, mas não faz parte do trajeto pelo mercado.
  const comprados = aComprar.filter((item) => item.purchased).length;

  // Simulação: "e se eu não levar isto?". Vive só na tela — nada é enviado, a
  // lista salva não muda e a prescrição menos ainda (decisão 8). Por isso é um
  // estado local, e não uma mutação.
  const [foraDaSimulacao, setForaDaSimulacao] = useState<string[]>([]);
  // Resultado que veio do servidor para cada item cuja quantidade foi mexida.
  const [porQuantidade, setPorQuantidade] = useState<Record<string, SimulatedItem>>({});
  const excluidos = new Set(foraDaSimulacao);

  const simulacao = useMutation({
    mutationFn: ({ itemId, quantidade }: { itemId: string; quantidade: string }) =>
      simulateShoppingList(lista.id, [{ item_id: itemId, quantity: quantidade }]),
    onSuccess: (resultado) =>
      setPorQuantidade((atual) => ({ ...atual, [resultado[0].item_id]: resultado[0] })),
  });

  // Cada item vale o que a simulação disse, ou o que a lista salva diz. A soma
  // continua sendo a daqui — o que veio do servidor foi o custo de cada item,
  // que é onde mora a regra da embalagem fechada.
  const itensSimulados = aComprar.map((item) => ({
    id: item.id,
    estimated_cost: porQuantidade[item.id]?.estimated_cost ?? item.estimated_cost,
  }));

  const simulando = foraDaSimulacao.length > 0 || Object.keys(porQuantidade).length > 0;
  const totalSimulado = simulatedTotal(itensSimulados, excluidos);
  // A comparação é contra a lista como ela está salva, não contra a própria
  // simulação: simular quantidade maior encarece, e dizer "a menos" seria falso.
  const totalOriginal = simulatedTotal(aComprar, new Set());

  return {
    porCorredor,
    aComprar: aComprar.length,
    dispensados: dispensados.length,
    comprados,
    progresso: aComprar.length === 0 ? 0 : (comprados / aComprar.length) * 100,
    // Nenhum item com preço quase sempre quer dizer região sem coleta — e aí o
    // total é R$ 0,00 por falta de dado, não por a compra ser de graça. Dizer
    // "sem preço" item por item não explica isso; a causa é a região.
    semPrecoNaRegiao:
      aComprar.length > 0 && aComprar.every((item) => item.estimated_cost === null),

    simulando,
    totalSimulado,
    totalOriginal,
    resumoDaSimulacao: descreverSimulacao(
      foraDaSimulacao.length,
      simulatedDifference(totalSimulado, totalOriginal),
    ),
    foraDaSimulacao: (itemId: string) => excluidos.has(itemId),
    simulado: (itemId: string) => porQuantidade[itemId] ?? null,
    calculando: simulacao.isPending,

    marcacaoFalhou: marcacao.isError,
    removendo: remocao.isPending,
    erroDaRemocao: remocao.isError
      ? mensagem(remocao.error, 'não foi possível tirar o item da lista')
      : null,

    alternarComprado: (item: ShoppingListItem) =>
      marcacao.mutate({ itemId: item.id, comprado: !item.purchased }),
    remover: (itemId: string) => remocao.mutate(itemId),
    alternarSimulacao: (itemId: string) =>
      setForaDaSimulacao((fora) =>
        fora.includes(itemId) ? fora.filter((id) => id !== itemId) : [...fora, itemId],
      ),
    simularQuantidade: (itemId: string, quantidade: string) =>
      simulacao.mutate({ itemId, quantidade }),
    limparSimulacao: () => {
      setForaDaSimulacao([]);
      setPorQuantidade({});
    },
  };
}

/** O campo "simular outra quantidade" de um item. */
export function useSimulatedQuantityField() {
  const [aberto, setAberto] = useState(false);
  const [quantidade, setQuantidade] = useState('');

  return {
    aberto,
    quantidade,
    /** A quantidade normalizada, ou nulo se o texto não é número. */
    numero: parseDecimal(quantidade),
    abrir: () => setAberto(true),
    setQuantidade,
  };
}

/**
 * Acrescentar à compra um produto que o plano não pediu.
 *
 * Mesmos dois passos do cadastro da despensa — escolher o produto do catálogo e
 * dizer quanto —, pela mesma razão: item sem produto não tem preço, e
 * quantidade em grandeza que o produto não usa não vira compra nenhuma.
 */
export function useAddExtraItemViewModel(listId: string) {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState('');
  // Texto aguardando a escolha do produto. Nulo quando não há nada em curso.
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  const [produto, setProduto] = useState<Product | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<MeasurementUnit>('unidade');

  const candidatos = useQuery({
    queryKey: ['product-search', escolhendo],
    queryFn: () => searchProducts(escolhendo!),
    enabled: escolhendo !== null,
  });

  const acrescentar = useMutation({
    mutationFn: ({ produtoId, medida }: { produtoId: string; medida: string }) =>
      addExtraItem(listId, { product_id: produtoId, quantity: medida, unit: unidade }),
    onSuccess: () => {
      fechar();
      cliente.invalidateQueries({ queryKey: ['shopping-list', listId] });
      // O que entra na compra conta para a disponibilidade das receitas.
      cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    },
  });

  function fechar() {
    setTexto('');
    setEscolhendo(null);
    setProduto(null);
  }

  const numero = parseDecimal(quantidade);
  const podeBuscar = texto.trim().length >= BUSCA_MINIMA;

  return {
    texto,
    escolhendo,
    produto,
    quantidade,
    unidade,
    candidatos: candidatos.data ?? null,
    buscando: candidatos.isPending && escolhendo !== null,
    buscaFalhou: candidatos.isError,
    podeBuscar,
    quantidadeValida: numero !== null,
    acrescentando: acrescentar.isPending,
    erro: acrescentar.isError
      ? mensagem(acrescentar.error, 'não foi possível acrescentar o item')
      : null,

    setTexto,
    setQuantidade,
    setUnidade,
    buscar: () => {
      if (podeBuscar) setEscolhendo(texto.trim());
    },
    /** Produto escolhido: falta dizer quanto levar. A embalagem é o palpite. */
    escolherProduto: (escolhido: Product) => {
      const sugestao = suggestedAmount(escolhido);
      setQuantidade(sugestao.quantity);
      setUnidade(sugestao.unit);
      setProduto(escolhido);
      setEscolhendo(null);
    },
    acrescentar: () => {
      if (produto !== null && numero !== null) {
        acrescentar.mutate({ produtoId: produto.id, medida: numero });
      }
    },
    cancelar: fechar,
  };
}
