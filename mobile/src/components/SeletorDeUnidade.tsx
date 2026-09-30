/**
 * Unidades compatíveis com a grandeza em que o produto é vendido.
 *
 * Produto vendido por unidade não tem escolha a fazer — mostra o rótulo e
 * pronto, em vez de um seletor de uma opção só.
 *
 * Saiu da tela da despensa quando o Mercado passou a pedir quantidade também,
 * ao acrescentar um item avulso: as duas telas precisam da mesma recusa, e
 * duplicá-la deixaria uma das duas oferecer "500 ml" de algo vendido por quilo.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { unitOptions } from '../services/units';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { MeasurementUnit, Product } from '../types/api';

export function SeletorDeUnidade({
  produto,
  escolhida,
  onEscolher,
}: {
  produto: Product;
  escolhida: MeasurementUnit;
  onEscolher: (unidade: MeasurementUnit) => void;
}) {
  const opcoes = unitOptions(produto.base_unit);

  if (opcoes.length === 1) {
    return <Text style={styles.unidadeFixa}>unidades</Text>;
  }

  return (
    <View style={styles.unidades}>
      {opcoes.map((opcao) => {
        const ativa = opcao === escolhida;
        return (
          <Pressable
            key={opcao}
            accessibilityRole="button"
            accessibilityLabel={`Unidade ${opcao}`}
            accessibilityState={{ selected: ativa }}
            onPress={() => onEscolher(opcao)}
            style={[styles.unidadeBotao, ativa && styles.unidadeBotaoAtivo]}
          >
            <Text style={[styles.unidadeTexto, ativa && styles.unidadeTextoAtivo]}>
              {opcao}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  unidades: { flexDirection: 'row', gap: spacing.xs },
  unidadeBotao: {
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLowest,
  },
  unidadeBotaoAtivo: { backgroundColor: colors.primaryContainer },
  unidadeTexto: { ...typography.labelLg, color: colors.onSurfaceVariant },
  unidadeTextoAtivo: { color: colors.onPrimary },
  unidadeFixa: { ...typography.labelLg, color: colors.onSurfaceVariant },
});
