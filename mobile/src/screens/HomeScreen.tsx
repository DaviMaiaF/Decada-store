/**
 * Tela de início: onde o app abre e para onde a compra concluída leva.
 *
 * Fica fora das quatro abas de propósito — ela não é mais um lugar para
 * navegar, e sim a porta de entrada: diz em que ponto da jornada a pessoa está
 * e leva direto para a aba que resolve a próxima etapa.
 *
 * A próxima etapa vem da mesma trilha que fica no topo, para as duas nunca
 * discordarem sobre onde a pessoa parou.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, SectionTitle } from '../components';
import { type EtapaDaTrilha, etapasUltrapassadas } from '../components/Trilha';
import { colors, spacing, typography } from '../theme/tokens';

export type AbaDeDestino = 'Dieta' | 'Mercado' | 'Despensa' | 'Economia';

type ProximoPasso = { titulo: string; texto: string; botao: string; aba: AbaDeDestino };

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

export default function HomeScreen({
  etapas,
  onIr,
}: {
  etapas: EtapaDaTrilha[];
  /** Sai do início para a aba escolhida. */
  onIr: (aba: AbaDeDestino) => void;
}) {
  const passo = proximoPasso(etapas);

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Olá!</Text>
      <Body muted>A DÉCADA transforma o plano da sua nutricionista em compra de mercado.</Body>

      <Card style={styles.passo}>
        <Text style={styles.rotulo}>
          {passo === CONCLUIDO ? 'JORNADA CONCLUÍDA' : 'PRÓXIMA ETAPA'}
        </Text>
        <SectionTitle>{passo.titulo}</SectionTitle>
        <Body muted>{passo.texto}</Body>
        {passo.detalhe ? <Text style={styles.detalhe}>{passo.detalhe} concluídos</Text> : null}
        <View style={styles.acao}>
          <Button label={passo.botao} onPress={() => onIr(passo.aba)} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  titulo: { ...typography.headlineLg, color: colors.primary },
  passo: { gap: spacing.xs2 },
  rotulo: { ...typography.labelSm, color: colors.onSurfaceVariant },
  detalhe: { ...typography.labelLg, color: colors.primary },
  acao: { marginTop: spacing.xs },
});
