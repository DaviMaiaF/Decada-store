/**
 * ViewModel da aba Despensa: o que está em casa e o que dá para cozinhar.
 *
 * Ao adicionar, a pessoa escolhe qual produto do catálogo é aquilo e diz quanto
 * tem. Sem o vínculo o item não abate da lista nem conta para as receitas; sem a
 * quantidade ele conta para as receitas mas não abate nada. Tocar num item já
 * salvo abre o mesmo par produto + quantidade.
 *
 * A tela tem dois fluxos de formulário — adicionar e editar — com estado
 * próprio cada um (`useAddFlow` e `useEditFlow`): os dois painéis nunca estão
 * abertos ao mesmo tempo, mas compartilhar os campos deixaria um sujar o outro.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ApiError,
  addExtraItem,
  addPantryItem,
  readPantry,
  readRecipeSuggestions,
  readShoppingList,
  removePantryItem,
  searchProducts,
  updatePantryItem,
} from '../services/api';
import { amountToField, parseDecimal, suggestedAmount } from '../services/units';
import type {
  MeasurementUnit,
  PantryItem,
  Product,
  RecipeAvailability,
  RecipeIngredient,
} from '../types/api';

// Quanto esperar o último item confirmado pela foto antes de recalcular as receitas.
export const ESPERA_DAS_RECEITAS = 1000;

// Uma letra devolveria o catálogo inteiro.
const BUSCA_MINIMA = 2;

type Medida = { quantidade: string; unidade: MeasurementUnit };

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

export function usePantryViewModel(listId: string | null) {
  const cliente = useQueryClient();

  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });

  // A disponibilidade soma duas fontes: a despensa e a lista de compras
  // corrente. Sem o id da lista ela contava só o que está em casa, e uma
  // receita cujo ingrediente já estava no carrinho aparecia como incompleta.
  const receitas = useQuery({
    queryKey: ['recipe-suggestions', listId],
    queryFn: () => readRecipeSuggestions(listId ?? undefined),
  });

  // Mesma chave que o Mercado usa: o React Query serve as duas telas do mesmo
  // cache, e saber o que já está na lista não custa requisição nova.
  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  /** Depois de mexer na despensa, as receitas mudam junto. */
  function recarregar() {
    cliente.invalidateQueries({ queryKey: ['pantry'] });
    cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
  }

  const recargaDasReceitas = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (recargaDasReceitas.current) clearTimeout(recargaDasReceitas.current);
    },
    [],
  );

  /**
   * Item confirmado na revisão da foto. A pessoa confirma vários em sequência,
   * e recarregar a despensa e as receitas a cada um redesenhava a tela inteira
   * entre um toque e outro. O item que o servidor devolveu entra direto no
   * cache — a lista vem do mais recente ao mais antigo, então vai no começo —,
   * e as receitas são recarregadas uma vez só, quando os toques param.
   */
  function guardadoPelaFoto(item: PantryItem) {
    cliente.setQueryData<PantryItem[]>(['pantry'], (atual) => [item, ...(atual ?? [])]);
    if (recargaDasReceitas.current) clearTimeout(recargaDasReceitas.current);
    recargaDasReceitas.current = setTimeout(() => {
      recargaDasReceitas.current = null;
      cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    }, ESPERA_DAS_RECEITAS);
  }

  const adicao = useAddFlow(recarregar);
  const edicao = useEditFlow(recarregar);

  const remocao = useMutation({
    mutationFn: (itemId: string) => removePantryItem(itemId),
    onSuccess: recarregar,
  });

  const itens = despensa.data ?? [];

  return {
    itens,
    carregando: despensa.isPending,
    falhou: despensa.isError,
    semVinculo: itens.filter((item) => item.product === null).length,
    // Item vinculado mas sem quantidade conta para as receitas e não abate nada
    // da compra. Sem este aviso a pessoa acha que o vínculo bastava.
    semQuantidade: itens.filter(
      (item) => item.product !== null && (item.quantity === null || item.unit === null),
    ).length,

    receitas: receitas.data ?? [],
    buscandoReceitas: receitas.isPending,
    receitasFalharam: receitas.isError,
    // Produto que já está na lista não entra de novo — o servidor recusa com 409.
    // Sem isto o botão convidava para uma recusa: o ingrediente falta porque a
    // receita pede mais do que a lista traz, e não porque ele não foi comprado.
    naLista: new Set((lista.data?.items ?? []).map((item) => item.product.id)),

    adicao,
    edicao: {
      ...edicao,
      /** Abrir a edição fecha o fluxo de adicionar. */
      abrir: (item: PantryItem) => {
        adicao.cancelar();
        edicao.abrir(item);
      },
    },
    guardadoPelaFoto,
    remover: (itemId: string) => remocao.mutate(itemId),
  };
}

/** Adicionar: texto → produto → quantidade, ou só texto. */
function useAddFlow(recarregar: () => void) {
  const [texto, setTexto] = useState('');
  // Texto aguardando a escolha do produto. Nulo quando não há nada em curso.
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  // Produto já escolhido, aguardando a quantidade. Segundo e último passo.
  const [medindo, setMedindo] = useState<{ descricao: string; produto: Product } | null>(
    null,
  );
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<MeasurementUnit>('unidade');

  const candidatos = useQuery({
    queryKey: ['product-search', escolhendo],
    queryFn: () => searchProducts(escolhendo!),
    enabled: escolhendo !== null,
  });

  const adicionar = useMutation({
    mutationFn: ({
      descricao,
      produtoId,
      medida,
    }: {
      descricao: string;
      produtoId: string | null;
      medida?: Medida | null;
    }) =>
      addPantryItem({
        raw_description: descricao,
        product_id: produtoId,
        // O backend recusa o par pela metade, então ou vão os dois ou nenhum.
        ...(medida ? { quantity: medida.quantidade, unit: medida.unidade } : {}),
      }),
    onSuccess: () => {
      setTexto('');
      setEscolhendo(null);
      setMedindo(null);
      recarregar();
    },
  });

  function comecarEscolha() {
    const descricao = texto.trim();
    if (descricao.length < BUSCA_MINIMA) return;
    setEscolhendo(descricao);
  }

  /** Produto escolhido: falta dizer quanto se tem dele. */
  function escolherProduto(produto: Product) {
    if (escolhendo === null) return;
    const sugestao = suggestedAmount(produto);
    setQuantidade(sugestao.quantity);
    setUnidade(sugestao.unit);
    setMedindo({ descricao: escolhendo, produto });
    setEscolhendo(null);
  }

  function salvarMedido(comQuantidade: boolean) {
    if (medindo === null) return;
    const numero = comQuantidade ? parseDecimal(quantidade) : null;
    adicionar.mutate({
      descricao: medindo.descricao,
      produtoId: medindo.produto.id,
      medida: numero === null ? null : { quantidade: numero, unidade },
    });
  }

  return {
    texto,
    escolhendo,
    medindo,
    quantidade,
    unidade,
    candidatos: candidatos.data ?? null,
    buscando: candidatos.isPending && escolhendo !== null,
    buscaFalhou: candidatos.isError,
    podeComecar: texto.trim().length >= BUSCA_MINIMA && !adicionar.isPending,
    quantidadeValida: parseDecimal(quantidade) !== null,
    salvando: adicionar.isPending,
    erro: adicionar.isError ? mensagem(adicionar.error, 'não foi possível adicionar') : null,

    setTexto,
    setQuantidade,
    setUnidade,
    comecarEscolha,
    escolherProduto,
    guardarSoTexto: () => {
      if (escolhendo !== null) adicionar.mutate({ descricao: escolhendo, produtoId: null });
    },
    salvarComQuantidade: () => salvarMedido(true),
    salvarSemQuantidade: () => salvarMedido(false),
    cancelarEscolha: () => setEscolhendo(null),
    cancelarMedida: () => setMedindo(null),
    cancelar: () => {
      setEscolhendo(null);
      setMedindo(null);
    },
  };
}

/** Editar um item salvo: vincular o produto, medir ou apagar a medição. */
function useEditFlow(recarregar: () => void) {
  const [editando, setEditando] = useState<PantryItem | null>(null);
  const [busca, setBusca] = useState('');
  const [produto, setProduto] = useState<Product | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<MeasurementUnit>('unidade');

  const candidatos = useQuery({
    queryKey: ['product-search', busca],
    queryFn: () => searchProducts(busca),
    enabled: busca.trim().length >= BUSCA_MINIMA,
  });

  const atualizar = useMutation({
    mutationFn: ({
      itemId,
      produtoId,
      medida,
    }: {
      itemId: string;
      produtoId: string | null;
      medida: Medida | null;
    }) =>
      updatePantryItem(itemId, {
        product_id: produtoId,
        // Aqui os dois campos vão sempre, inclusive nulos: nulo nos dois é como
        // se diz "não sei mais a quantidade" e apaga a medição que havia.
        quantity: medida === null ? null : medida.quantidade,
        unit: medida === null ? null : medida.unidade,
      }),
    onSuccess: () => {
      setEditando(null);
      recarregar();
    },
  });

  /** Tocar no item abre o mesmo par produto + quantidade, já preenchido. */
  function abrir(item: PantryItem) {
    setEditando(item);
    setProduto(item.product);
    setBusca('');

    if (item.product !== null && item.quantity !== null && item.unit !== null) {
      setQuantidade(amountToField(item.quantity));
      setUnidade(item.unit);
      return;
    }
    const sugestao =
      item.product === null
        ? { quantity: '', unit: 'unidade' as MeasurementUnit }
        : suggestedAmount(item.product);
    setQuantidade(sugestao.quantity);
    setUnidade(sugestao.unit);
  }

  /** Produto escolhido na edição: a unidade passa a ser a da grandeza dele. */
  function escolherProduto(escolhido: Product) {
    const sugestao = suggestedAmount(escolhido);
    setProduto(escolhido);
    setQuantidade(sugestao.quantity);
    setUnidade(sugestao.unit);
  }

  // Campo vazio é intenção ("não sei"); texto que não é número é erro de digitação,
  // e gravar nulo por causa dele apagaria a medição sem a pessoa pedir.
  const medidaInvalida = quantidade.trim() !== '' && parseDecimal(quantidade) === null;

  function salvar() {
    if (editando === null || medidaInvalida) return;
    // Campo vazio é "não sei a quantidade", e apaga a medição.
    const numero = quantidade.trim() === '' ? null : parseDecimal(quantidade);
    atualizar.mutate({
      itemId: editando.id,
      produtoId: produto === null ? null : produto.id,
      medida: numero === null ? null : { quantidade: numero, unidade },
    });
  }

  return {
    editando,
    busca,
    produto,
    quantidade,
    unidade,
    candidatos: candidatos.data ?? null,
    medidaInvalida,
    salvando: atualizar.isPending,
    erro: atualizar.isError
      ? mensagem(atualizar.error, 'não foi possível salvar a medição')
      : null,

    abrir,
    setBusca,
    setQuantidade,
    setUnidade,
    escolherProduto,
    salvar,
    cancelar: () => setEditando(null),
  };
}

/** "arroz", "arroz e feijão", "arroz, feijão e farofa". */
export function enumerar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Um cartão de receita: o que falta, o que dá para acrescentar e o preparo. */
export function useRecipeCardViewModel(
  disponibilidade: RecipeAvailability,
  /** Nulo enquanto não há lista de compras: sem ela não há onde acrescentar. */
  listId: string | null,
  /** Ids dos produtos que a lista de compras já tem. */
  naLista: Set<string>,
) {
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const { missing } = disponibilidade;

  /**
   * O ingrediente que falta vai para a lista de compras, na quantidade que a
   * receita pede. Não passa pelo plano alimentar: o que muda é a compra.
   */
  const acrescentar = useMutation({
    mutationFn: (ingrediente: RecipeIngredient) =>
      addExtraItem(listId!, {
        product_id: ingrediente.product.id,
        quantity: ingrediente.quantity,
        unit: ingrediente.unit,
      }),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['shopping-list'] });
      // A receita acabou de ficar mais disponível: o que está na lista conta.
      cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
    },
  });

  return {
    aberto,
    temLista: listId !== null,
    /** Falta e ainda não está na lista: dá para acrescentar. */
    acrescentaveis: missing.filter((ingrediente) => !naLista.has(ingrediente.product.id)),
    /** Já está na lista, em quantidade menor do que a receita pede. */
    jaNaLista: enumerar(
      missing
        .filter((ingrediente) => naLista.has(ingrediente.product.id))
        .map((ingrediente) => ingrediente.product.name),
    ),
    quantosJaNaLista: missing.filter((ingrediente) => naLista.has(ingrediente.product.id))
      .length,
    acrescentando: acrescentar.isPending,
    erro: acrescentar.isError
      ? mensagem(acrescentar.error, 'não foi possível acrescentar à lista')
      : null,
    acrescentar: (ingrediente: RecipeIngredient) => acrescentar.mutate(ingrediente),
    alternarPreparo: () => setAberto((estava) => !estava),
  };
}
