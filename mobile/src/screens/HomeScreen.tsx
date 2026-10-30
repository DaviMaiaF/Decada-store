/**
 * Tela de início: onde o app abre e para onde a compra concluída leva.
 *
 * Fica fora das quatro abas de propósito — ela não é mais um lugar para
 * navegar, e sim a porta de entrada: diz em que ponto da jornada a pessoa está
 * e leva direto para a aba que resolve a próxima etapa.
 *
 * Qual é a próxima etapa é decisão do `useHomeViewModel`; a tela só a desenha.
 * Abaixo dela, um card por aba para quem quer ir direto a outro lugar sem
 * seguir a ordem.
 */

import type { ComponentType } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, SectionTitle } from '../components';
import { Entrada } from '../components/Entrada';
import { Logo } from '../components/Logo';
import { Tocavel } from '../components/Tocavel';
import { IconeDespensa, IconeDieta, IconeEconomia, IconeMercado } from '../components/TabIcons';
import type { EtapaDaTrilha } from '../components/Trilha';
import { motion } from '../theme/motion';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import { type AbaDeDestino, useHomeViewModel } from '../viewmodels/useHomeViewModel';

// A navegação e os testes da tela importam daqui; a regra mora no ViewModel.
export { type AbaDeDestino, proximoPasso } from '../viewmodels/useHomeViewModel';

/**
 * Os atalhos, na ordem da barra de abas. Os ícones são os mesmos dela. São fixos
 * e só de apresentação, por isso ficam na View e não no ViewModel.
 */
const ATALHOS: {
  aba: AbaDeDestino;
  texto: string;
  Icone: ComponentType<{ color: string; size?: number }>;
}[] = [
  { aba: 'Dieta', texto: 'Plano e produtos', Icone: IconeDieta },
  { aba: 'Mercado', texto: 'Lista e compra', Icone: IconeMercado },
  { aba: 'Despensa', texto: 'O que há em casa', Icone: IconeDespensa },
  { aba: 'Economia', texto: 'Custo e economia', Icone: IconeEconomia },
];

export default function HomeScreen({
  etapas,
  onIr,
}: {
  etapas: EtapaDaTrilha[];
  /** Sai do início para a aba escolhida. */
  onIr: (aba: AbaDeDestino) => void;
}) {
  const { passo, jornadaConcluida, planoRecebido } = useHomeViewModel(etapas);

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      {/* Tudo entra em cascata, de cima para baixo, na ordem de leitura. */}
      <Entrada style={styles.boasVindas}>
        <Logo tamanho={32} />
        <Text style={styles.titulo}>Olá!</Text>
        <Body muted>A DÉCADA transforma o plano da sua nutricionista em compra de mercado.</Body>
      </Entrada>

      {/* O plano em si fica na aba Dieta, onde a pessoa lê, aceita ou recusa. */}
      {planoRecebido ? (
        <Entrada atraso={motion.duration.stagger}>
          <Card style={[styles.passo, styles.recebido]}>
            <Chip label="ENVIADO PELA SUA NUTRICIONISTA" tone="success" />
            <SectionTitle>{planoRecebido.titulo}</SectionTitle>
            <Body muted>{planoRecebido.texto}</Body>
            <View style={styles.acao}>
              <Button label="Conferir o plano" onPress={() => onIr('Dieta')} />
            </View>
          </Card>
        </Entrada>
      ) : null}

      <Entrada atraso={motion.duration.stagger * 2}>
        <Card style={styles.passo}>
          <Text style={styles.rotulo}>
            {jornadaConcluida ? 'JORNADA CONCLUÍDA' : 'PRÓXIMA ETAPA'}
          </Text>
          <SectionTitle>{passo.titulo}</SectionTitle>
          <Body muted>{passo.texto}</Body>
          {passo.detalhe ? <Text style={styles.detalhe}>{passo.detalhe} concluídos</Text> : null}
          <View style={styles.acao}>
            <Button label={passo.botao} onPress={() => onIr(passo.aba)} />
          </View>
        </Card>
      </Entrada>

      <Entrada atraso={motion.duration.stagger * 3}>
        <SectionTitle>Ir para</SectionTitle>
      </Entrada>
      <View style={styles.grade}>
        {ATALHOS.map(({ aba, texto, Icone }, i) => (
          <Entrada
            key={aba}
            atraso={motion.duration.stagger * (4 + i)}
            style={styles.atalhoCaixa}
          >
            <Tocavel
              accessibilityRole="button"
              accessibilityLabel={`Ir para ${aba}`}
              onPress={() => onIr(aba)}
              style={styles.atalho}
            >
              <View style={styles.atalhoIcone}>
                <Icone color={colors.onPrimaryFixedVariant} size={24} />
              </View>
              <Text style={styles.atalhoNome}>{aba}</Text>
              <Text style={styles.atalhoTexto}>{texto}</Text>
            </Tocavel>
          </Entrada>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  boasVindas: { gap: spacing.md },
  titulo: { ...typography.headlineLg, color: colors.primary },
  passo: { gap: spacing.xs2 },
  recebido: { borderWidth: 1, borderColor: colors.primary },
  rotulo: { ...typography.labelSm, color: colors.onSurfaceVariant },
  detalhe: { ...typography.labelLg, color: colors.primary },
  acao: { marginTop: spacing.xs },

  // Duas colunas: quatro cards cabem numa tela de celular sem rolar.
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // A caixa da entrada ocupa a célula da grade; o atalho a preenche.
  atalhoCaixa: { flexBasis: '47%', flexGrow: 1 },
  atalho: {
    flexGrow: 1,
    minHeight: MIN_TOUCH_HEIGHT * 2,
    padding: spacing.md,
    gap: spacing.xs2,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  atalhoIcone: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryFixed,
  },
  atalhoNome: { ...typography.labelLg, color: colors.onSurface },
  atalhoTexto: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
