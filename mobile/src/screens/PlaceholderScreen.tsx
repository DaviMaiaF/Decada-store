/**
 * Aba prevista no protótipo que ainda não faz parte desta fatia.
 *
 * Existe em vez de a aba sumir: a navegação inferior tem quatro abas no
 * protótipo, e esconder duas daria a impressão de que o app é menor do que o
 * projetado.
 */

import { StyleSheet, Text, View } from 'react-native';

import { Body } from '../components';
import { colors, spacing, typography } from '../theme/tokens';

export default function PlaceholderScreen({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <View style={styles.tela}>
      <Text style={styles.titulo}>{titulo}</Text>
      <Body muted>{descricao}</Body>
      <Text style={styles.nota}>
        O backend desta tela já existe e tem teste. Falta a interface.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: spacing.margin,
    justifyContent: 'center',
    gap: spacing.sm,
  },
  titulo: { ...typography.headlineLg, color: colors.primary },
  nota: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
