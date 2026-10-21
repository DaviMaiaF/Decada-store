/**
 * Tela de início: onde o app abre e para onde a compra concluída leva.
 *
 * Fica fora das quatro abas de propósito — ela não é mais um lugar para
 * navegar, e sim a porta de entrada: diz em que ponto da jornada a pessoa está
 * e leva direto para a aba que resolve a próxima etapa.
 *
 * Qual é a próxima etapa é decisão do `useHomeViewModel`; a tela só a desenha.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, SectionTitle } from '../components';
import type { EtapaDaTrilha } from '../components/Trilha';
import { colors, spacing, typography } from '../theme/tokens';
import { type AbaDeDestino, useHomeViewModel } from '../viewmodels/useHomeViewModel';

// A navegação e os testes da tela importam daqui; a regra mora no ViewModel.
export { type AbaDeDestino, proximoPasso } from '../viewmodels/useHomeViewModel';

export default function HomeScreen({
  etapas,
  onIr,
}: {
  etapas: EtapaDaTrilha[];
  /** Sai do início para a aba escolhida. */
  onIr: (aba: AbaDeDestino) => void;
}) {
  const { passo, jornadaConcluida } = useHomeViewModel(etapas);

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Olá!</Text>
      <Body muted>A DÉCADA transforma o plano da sua nutricionista em compra de mercado.</Body>

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
