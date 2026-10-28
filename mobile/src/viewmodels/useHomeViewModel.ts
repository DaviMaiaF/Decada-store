/**
 * ViewModel da tela de início.
 *
 * Decide qual é a próxima etapa da jornada a partir da mesma trilha que fica no
 * topo, para as duas nunca discordarem sobre onde a pessoa parou.
 *
 * Também avisa quando a nutricionista enviou um plano para o e-mail desta conta.
 * Lê a mesma query da aba Dieta: aceitar ou recusar lá some com o aviso aqui.
 */

import { type EtapaDaTrilha, etapasUltrapassadas } from '../components/Trilha';
import type { ReceivedPrescription } from '../types/api';
import { useReceivedPrescriptionsViewModel } from './useReceivedPrescriptionsViewModel';

export type AbaDeDestino = 'Dieta' | 'Mercado' | 'Despensa' | 'Economia';

export type ProximoPasso = { titulo: string; texto: string; botao: string; aba: AbaDeDestino };

/**
 * O que fazer em cada etapa da trilha, na mesma ordem dela:
 * Enviar → Confirmar → Despensa → Região → Comprar.
 */
const PASSOS: ProximoPasso[] = [
  {
    titulo: 'Envie o plano da sua nutricionista',
    texto: 'Comece importando o PDF da prescrição na aba Dieta.',
    botao: 'Enviar o plano',
    aba: 'Dieta',
  },
  {
    titulo: 'Confirme os produtos',
    texto: 'Diga qual produto do mercado corresponde a cada item do plano.',
    botao: 'Confirmar produtos',
    aba: 'Dieta',
  },
  {
    titulo: 'Diga o que você já tem em casa',
    texto: 'A despensa abate da lista o que você não precisa comprar.',
    botao: 'Cadastrar a despensa',
    aba: 'Despensa',
  },
  {
    titulo: 'Escolha a região e gere a lista',
    texto: 'O preço estimado é sempre o da sua cidade.',
    botao: 'Gerar a lista',
    aba: 'Mercado',
  },
  {
    titulo: 'Faça a sua compra',
    texto: 'Marque o que já pegou ou finalize a compra com o que escolheu.',
    botao: 'Ir ao mercado',
    aba: 'Mercado',
  },
];

const CONCLUIDO: ProximoPasso = {
  titulo: 'Compra concluída',
  texto: 'Tudo o que o plano pedia está na sacola. Veja quanto a sua despensa poupou.',
  botao: 'Ver a economia',
  aba: 'Economia',
};

export function proximoPasso(etapas: EtapaDaTrilha[]): ProximoPasso & { detalhe?: string } {
  const atual = etapasUltrapassadas(etapas).findIndex((ultrapassada) => !ultrapassada);
  if (atual === -1) return CONCLUIDO;
  return { ...PASSOS[atual], detalhe: etapas[atual].detalhe };
}

export type PlanoRecebido = { titulo: string; texto: string };

/** O aviso de plano enviado pela nutricionista, ou `null` quando não há nenhum pendente. */
export function avisoDePlanoRecebido(planos: ReceivedPrescription[]): PlanoRecebido | null {
  if (!planos.length) return null;
  if (planos.length > 1) {
    return {
      titulo: `${planos.length} planos alimentares chegaram para você`,
      texto: 'Sua nutricionista montou planos para você. Confira e escolha qual usar.',
    };
  }
  const [plano] = planos;
  const autora = [plano.author.full_name, plano.author.crn].filter(Boolean).join(' · ');
  return {
    titulo: 'Seu plano alimentar já foi montado',
    texto: autora
      ? `${autora} enviou o seu plano. Confira antes de aceitar.`
      : 'Sua nutricionista enviou o seu plano. Confira antes de aceitar.',
  };
}

export function useHomeViewModel(etapas: EtapaDaTrilha[]) {
  const passo = proximoPasso(etapas);
  const { planos } = useReceivedPrescriptionsViewModel();
  return {
    passo,
    jornadaConcluida: passo === CONCLUIDO,
    planoRecebido: avisoDePlanoRecebido(planos),
  };
}
