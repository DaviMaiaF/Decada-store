/**
 * ViewModel da tela de início.
 *
 * Decide qual é a próxima etapa da jornada a partir da mesma trilha que fica no
 * topo, para as duas nunca discordarem sobre onde a pessoa parou.
 */

import { type EtapaDaTrilha, etapasUltrapassadas } from '../components/Trilha';

export type AbaDeDestino = 'Dieta' | 'Mercado' | 'Despensa' | 'Economia';

export type ProximoPasso = { titulo: string; texto: string; botao: string; aba: AbaDeDestino };

/**
 * O que fazer em cada etapa da trilha, na mesma ordem dela:
 * Enviar → Confirmar → Região → Comprar.
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

export function useHomeViewModel(etapas: EtapaDaTrilha[]) {
  const passo = proximoPasso(etapas);
  return { passo, jornadaConcluida: passo === CONCLUIDO };
}
