/**
 * ViewModel da despensa por foto.
 *
 * Nada entra sozinho (decisão 11): cada alimento reconhecido vira uma revisão
 * pendente, com o produto do catálogo que parece ser ele, e só vai para a
 * despensa quando a pessoa confirma. A foto sai do aparelho só depois do aceite
 * e não é guardada em lugar nenhum.
 *
 * Uma geladeira não cabe numa foto só. A pessoa junta até `MAXIMO_DE_FOTOS`
 * (câmera, uma por vez, ou várias da galeria) e envia tudo de uma vez. Cada foto
 * vai para `POST /pantry/photo` como antes, e as propostas se juntam aqui: o
 * alimento que aparece em duas fotos vira uma revisão só.
 */

import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';

import { ApiError, addPantryItem, recognizePantryPhoto, searchProducts } from '../services/api';
import type { PantryItem, PhotoProposal, Product } from '../types/api';

export type SituacaoDaRevisao = 'pendente' | 'adicionado' | 'descartado';

export interface Revisao {
  /** Fixo durante a revisão: o nome muda quando a pessoa corrige. */
  id: number;
  proposta: PhotoProposal;
  /** Produto que vai junto ao confirmar. Nulo guarda só como texto. */
  escolhido: Product | null;
  situacao: SituacaoDaRevisao;
  /** Por que a gravação falhou. Cada linha guarda o seu: confirmações correm juntas. */
  erro?: string | null;
}

// O mesmo corte do servidor (`MINIMUM_SCORE`): abaixo disto o nome corrigido não
// tem produto parecido e vai para os não identificados, como viria da foto.
export const SEMELHANCA_MINIMA = 0.6;

// Uma letra devolveria o catálogo inteiro; o servidor recusa com 422.
export const NOME_MINIMO = 2;

// Qualidade 0,7 deixa a foto de celular bem menor sem perder o rótulo da
// embalagem; o servidor ainda reduz de novo antes de enviar ao reconhecimento.
const OPCOES_DA_FOTO: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
};

// Mais que isso é muita espera pela rede do celular e muita linha para revisar.
export const MAXIMO_DE_FOTOS = 5;

export interface Foto {
  uri: string;
  mimeType?: string | null;
}

/** Nome sem caixa, acento nem espaço sobrando: "Feijão " e "feijao" são o mesmo alimento. */
function chaveDoNome(nome: string): string {
  return nome
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Junta as propostas de várias fotos, na ordem em que vieram, sem repetir
 * alimento. Se o mesmo alimento veio identificado numa foto e não na outra,
 * fica a versão identificada — ela já traz o produto.
 */
export function juntarPropostas(porFoto: PhotoProposal[][]): PhotoProposal[] {
  const juntas: PhotoProposal[] = [];
  const posicao = new Map<string, number>();

  for (const proposta of porFoto.flat()) {
    const chave = chaveDoNome(proposta.name);
    const ja = posicao.get(chave);
    if (ja === undefined) {
      posicao.set(chave, juntas.length);
      juntas.push(proposta);
    } else if (!juntas[ja].identified && proposta.identified) {
      juntas[ja] = proposta;
    }
  }
  return juntas;
}

export function revisoesDe(propostas: PhotoProposal[]): Revisao[] {
  return propostas.map((proposta, id) => ({
    id,
    proposta,
    // Identificado já vem com o produto mais parecido escolhido; o não
    // identificado espera a pessoa dizer qual é.
    escolhido: proposta.identified ? (proposta.candidates[0]?.product ?? null) : null,
    situacao: 'pendente',
  }));
}

function mensagem(erro: unknown, padrao: string): string {
  return erro instanceof ApiError ? erro.message : padrao;
}

export function usePantryPhotoViewModel(
  /** Recebe o item que o servidor gravou, para a tela pôr na despensa sem recarregar. */
  onAdicionado: (item: PantryItem) => void,
) {
  const [aberto, setAberto] = useState(false);
  const [aceitou, setAceitou] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [revisoes, setRevisoes] = useState<Revisao[] | null>(null);
  /** As fotos juntadas e ainda não enviadas. */
  const [fotos, setFotos] = useState<Foto[]>([]);

  /**
   * Cada foto vai num pedido próprio, todos ao mesmo tempo. Uma foto que falha
   * não derruba as outras: a revisão mostra o que deu certo e avisa quantas
   * falharam. Só quando todas falham é erro.
   */
  const reconhecer = useMutation({
    mutationFn: async (enviadas: Foto[]) => {
      const resultados = await Promise.allSettled(
        enviadas.map((foto) =>
          recognizePantryPhoto({ uri: foto.uri, mimeType: foto.mimeType }, aceitou),
        ),
      );
      const certas = resultados.flatMap((r) => (r.status === 'fulfilled' ? [r.value.items] : []));
      const falhas = resultados.filter((r) => r.status === 'rejected');

      if (certas.length === 0) throw (falhas[0] as PromiseRejectedResult).reason;
      return { propostas: juntarPropostas(certas), enviadas: enviadas.length, falhas: falhas.length };
    },
    onSuccess: ({ propostas }) => {
      setRevisoes(revisoesDe(propostas));
      setFotos([]);
    },
  });

  /**
   * O ✓ aparece no toque, sem esperar o servidor: pela rede do celular a
   * resposta podia levar mais de meio segundo, e a pessoa confirmando vários
   * itens seguidos sentia cada um. Se a gravação falhar, a linha volta a ficar
   * pendente com o motivo — nada some em silêncio.
   */
  const confirmacao = useMutation({
    mutationFn: (revisao: Revisao) =>
      addPantryItem({
        raw_description: revisao.proposta.name,
        product_id: revisao.escolhido?.id ?? null,
      }),
    onMutate: (revisao) => mudar(revisao.id, { situacao: 'adicionado', erro: null }),
    onSuccess: (item) => onAdicionado(item),
    onError: (erro, revisao) =>
      mudar(revisao.id, {
        situacao: 'pendente',
        erro: mensagem(erro, 'não foi possível guardar o item'),
      }),
  });

  /** Nome corrigido: busca no catálogo de novo e troca a proposta inteira. */
  const renomeacao = useMutation({
    mutationFn: ({ nome }: { id: number; nome: string }) => searchProducts(nome),
    onSuccess: (candidatos, { id, nome }) => {
      const identified =
        candidatos.length > 0 && Number(candidatos[0].score) >= SEMELHANCA_MINIMA;
      mudar(id, {
        proposta: { name: nome, identified, candidates: candidatos },
        escolhido: identified ? candidatos[0].product : null,
      });
    },
  });

  function mudar(id: number, mudanca: Partial<Revisao>) {
    setRevisoes((atuais) =>
      (atuais ?? []).map((revisao) => (revisao.id === id ? { ...revisao, ...mudanca } : revisao)),
    );
  }

  const vagas = MAXIMO_DE_FOTOS - fotos.length;

  /** Junta a foto à fila. Não envia: o envio é o `enviar`, depois de juntar tudo. */
  async function escolherFoto(origem: 'camera' | 'galeria') {
    setAviso(null);
    reconhecer.reset();
    if (vagas <= 0) return;

    if (origem === 'camera') {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissao.granted) {
        setAviso('Sem acesso à câmera. Libere nas configurações ou escolha uma foto da galeria.');
        return;
      }
    }

    const resultado =
      origem === 'camera'
        ? await ImagePicker.launchCameraAsync(OPCOES_DA_FOTO)
        : await ImagePicker.launchImageLibraryAsync({
            ...OPCOES_DA_FOTO,
            allowsMultipleSelection: true,
            selectionLimit: vagas,
          });

    if (resultado.canceled || !resultado.assets?.length) return;
    // A galeria do Android nem sempre respeita o limite: o corte é aqui.
    const novas = resultado.assets
      .slice(0, vagas)
      .map(({ uri, mimeType }) => ({ uri, mimeType }));
    setFotos((atuais) => [...atuais, ...novas].slice(0, MAXIMO_DE_FOTOS));
  }

  function limparFotos() {
    setRevisoes(null);
    setFotos([]);
    reconhecer.reset();
  }

  const visiveis = (revisoes ?? []).filter((revisao) => revisao.situacao !== 'descartado');

  return {
    aberto,
    aceitou,
    aviso,
    /** Nulo antes da foto ser reconhecida. */
    revisoes,
    fotos,
    podeJuntarMais: vagas > 0,
    /** Quantas fotos não voltaram do reconhecimento, quando outras voltaram. */
    fotosQueFalharam: reconhecer.data?.falhas ?? 0,
    fotosEnviadas: reconhecer.data?.enviadas ?? 0,
    identificados: visiveis.filter((revisao) => revisao.proposta.identified),
    naoIdentificados: visiveis.filter((revisao) => !revisao.proposta.identified),
    reconhecendo: reconhecer.isPending,
    erroDoReconhecimento: reconhecer.isError
      ? mensagem(reconhecer.error, 'não foi possível reconhecer as fotos')
      : null,
    erroDaCorrecao: renomeacao.isError
      ? mensagem(renomeacao.error, 'não foi possível buscar o nome corrigido')
      : null,
    buscando: (id: number) => renomeacao.isPending && renomeacao.variables?.id === id,

    abrir: () => setAberto(true),
    alternarAceite: () => setAceitou((estava) => !estava),
    escolherFoto,
    removerFoto: (indice: number) =>
      setFotos((atuais) => atuais.filter((_, i) => i !== indice)),
    enviar: () => {
      if (!aceitou || fotos.length === 0) return;
      setAviso(null);
      reconhecer.mutate(fotos);
    },
    confirmar: (revisao: Revisao) => confirmacao.mutate(revisao),
    escolher: (id: number, produto: Product | null) => mudar(id, { escolhido: produto }),
    descartar: (id: number) => mudar(id, { situacao: 'descartado' }),
    /** Falha rejeita a promessa: a linha mantém o campo aberto para tentar de novo. */
    renomear: (id: number, nome: string) => renomeacao.mutateAsync({ id, nome }),
    outrasFotos: limparFotos,
    fechar: () => {
      setAberto(false);
      setAviso(null);
      limparFotos();
      confirmacao.reset();
    },
  };
}

/**
 * Uma linha da revisão: trocar o produto e corrigir o nome são estados da linha,
 * que somem quando a correção dá certo.
 */
export function usePhotoRowViewModel(onRenomear: (nome: string) => Promise<unknown>) {
  const [trocando, setTrocando] = useState(false);
  // Texto do campo de correção. Nulo quando o campo está fechado.
  const [editando, setEditando] = useState<string | null>(null);

  const nomeNovo = editando?.trim() ?? '';
  const nomeValido = nomeNovo.length >= NOME_MINIMO;

  async function buscarNomeNovo() {
    if (!nomeValido) return;
    try {
      await onRenomear(nomeNovo);
      setEditando(null);
      setTrocando(false);
    } catch {
      // O erro aparece no painel; o campo fica aberto para tentar de novo.
    }
  }

  return {
    trocando,
    editando,
    nomeValido,
    alternarTroca: () => setTrocando((estava) => !estava),
    fecharTroca: () => setTrocando(false),
    abrirEdicao: (nomeAtual: string) => setEditando(nomeAtual),
    mudarNome: setEditando,
    cancelarEdicao: () => setEditando(null),
    buscarNomeNovo,
  };
}
