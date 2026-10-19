/**
 * Início da nutricionista: as receitas que ela escreveu.
 *
 * Nenhum protótipo desenhou a área da nutricionista; a tela segue os cartões e
 * a tipografia do sistema de design. As receitas dela aparecem nas sugestões
 * de todo paciente, então a tela diz isso antes de ela publicar a primeira.
 */

import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, ErrorNotice, SectionTitle } from '../components';
import { readAccount, readOwnRecipes } from '../services/api';
import { useAuth } from '../services/auth';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { Recipe } from '../types/api';

export default function NutritionistRecipesScreen({
  onNew,
  onEdit,
}: {
  onNew: () => void;
  onEdit: (recipe: Recipe) => void;
}) {
  const { signOut } = useAuth();
  const conta = useQuery({ queryKey: ['account'], queryFn: readAccount });
  const receitas = useQuery({ queryKey: ['own-recipes'], queryFn: readOwnRecipes });

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <View style={styles.cabecalho}>
        <Text style={styles.marca}>DÉCADA · NUTRICIONISTA</Text>
        <Text style={styles.titulo}>Suas receitas</Text>
        {conta.data ? (
          <Body muted>
            {conta.data.full_name}
            {conta.data.crn ? ` · ${conta.data.crn}` : ''}
          </Body>
        ) : null}
      </View>

      <Button label="Nova receita" onPress={onNew} />

      {receitas.isPending ? <Body muted>Carregando…</Body> : null}
      {receitas.isError ? <ErrorNotice message="não foi possível carregar suas receitas" /> : null}

      {receitas.data?.length === 0 ? (
        <Card style={styles.vazio}>
          <Body>Você ainda não publicou nenhuma receita.</Body>
          <Body muted>
            O que você publicar aparece nas sugestões dos pacientes da DÉCADA, com seu
            nome e CRN, ordenado pelo quanto cada um já tem em casa ou na lista.
          </Body>
        </Card>
      ) : null}

      {receitas.data?.map((receita) => (
        <Pressable
          key={receita.id}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${receita.name}`}
          onPress={() => onEdit(receita)}
        >
          <Card style={styles.receita}>
            <Text style={styles.receitaNome}>{receita.name}</Text>
            <Text style={styles.receitaDetalhe}>{resumo(receita)}</Text>
          </Card>
        </Pressable>
      ))}

      <View style={styles.conta}>
        <SectionTitle>Conta</SectionTitle>
        <Button label="Sair da conta" variant="ghost" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

function resumo(receita: Recipe): string {
  const ingredientes = receita.ingredients.length;
  return [
    `${ingredientes} ${ingredientes === 1 ? 'ingrediente' : 'ingredientes'}`,
    receita.prep_minutes ? `${receita.prep_minutes} minutos` : null,
    receita.servings ? `rende ${receita.servings}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const styles = StyleSheet.create({
  conteudo: {
    padding: spacing.margin,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    flexGrow: 1,
  },
  cabecalho: { gap: spacing.xs, marginBottom: spacing.xs },
  marca: { ...typography.labelSm, color: colors.secondary, letterSpacing: 2 },
  titulo: { ...typography.headlineLg, color: colors.primary },
  vazio: { gap: spacing.xs },
  receita: { gap: spacing.xs },
  receitaNome: { ...typography.headlineSm, color: colors.primary },
  receitaDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  conta: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
});
