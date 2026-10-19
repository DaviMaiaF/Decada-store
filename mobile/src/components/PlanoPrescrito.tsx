/**
 * O plano montado pela nutricionista, para ler: refeições, substituições e
 * orientação.
 *
 * Serve aos dois lados. O paciente lê aqui o plano antes de aceitar, e depois
 * as substituições que não vão para a lista de compras (decisão 8: elas vieram
 * da nutricionista, então aparecem; quem escolhe trocar é a pessoa, em casa).
 * A nutricionista lê aqui o plano já aceito, que não muda mais.
 */

import { StyleSheet, Text, View } from 'react-native';

import { amountToField } from '../services/units';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PrescriptionItem, PrescriptionMeal } from '../types/api';

function quantidade(item: PrescriptionItem): string {
  const numero = amountToField(item.quantity);
  if (item.unit !== 'unidade') return `${numero} ${item.unit}`;
  return `${numero} ${Number(item.quantity) === 1 ? 'unidade' : 'unidades'}`;
}

function Alimento({ item }: { item: PrescriptionItem }) {
  return (
    <Text style={styles.alimento}>
      {item.food}
      <Text style={styles.medida}>
        {' · '}
        {quantidade(item)}
        {item.household_measure ? ` (${item.household_measure})` : ''}
      </Text>
    </Text>
  );
}

export function PlanoPrescrito({
  meals,
  notes,
}: {
  meals: PrescriptionMeal[];
  notes: string | null;
}) {
  return (
    <View style={styles.plano}>
      {meals.map((meal, indice) => (
        <View key={`${meal.time}-${indice}`} style={styles.refeicao}>
          <Text style={styles.refeicaoNome}>
            {meal.time.slice(0, 5)} · {meal.name}
          </Text>
          {meal.items.map((item, i) => (
            <Alimento key={i} item={item} />
          ))}
          {meal.notes ? <Text style={styles.orientacao}>{meal.notes}</Text> : null}

          {meal.substitutions.map((opcao, n) => (
            <View key={n} style={styles.substituicao}>
              <Text style={styles.substituicaoTitulo}>Substituição {n + 1}</Text>
              {opcao.map((item, i) => (
                <Alimento key={i} item={item} />
              ))}
            </View>
          ))}
        </View>
      ))}

      {notes ? (
        <View style={styles.refeicao}>
          <Text style={styles.refeicaoNome}>Orientações gerais</Text>
          <Text style={styles.orientacao}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plano: { gap: spacing.md },
  refeicao: { gap: spacing.xs2 },
  refeicaoNome: { ...typography.labelLg, color: colors.primary },
  alimento: { ...typography.bodyMd, color: colors.onSurface },
  medida: { color: colors.onSurfaceVariant },
  orientacao: { ...typography.bodySm, color: colors.onSurfaceVariant, fontStyle: 'italic' },
  substituicao: {
    gap: spacing.xs2,
    marginTop: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerHigh,
  },
  substituicaoTitulo: { ...typography.labelMd, color: colors.onSurfaceVariant },
});
