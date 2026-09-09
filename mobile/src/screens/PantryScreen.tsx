/**
 * Despensa e receitas — a aba "O que tem na sua casa?" do protótipo.
 *
 * As duas coisas moram na mesma tela porque uma existe por causa da outra: a
 * lista do que está em casa e o que dá para cozinhar com isso.
 *
 * Item adicionado aqui vira chip na hora, sem escolher produto do catálogo. Em
 * troca da rapidez, ele **não abate** da lista de compras enquanto não estiver
 * vinculado — e a tela precisa dizer isso, senão a pessoa acha que descontou.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Body, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import {
  ApiError,
  addPantryItem,
  readPantry,
  readRecipeSuggestions,
  removePantryItem,
} from '../services/api';
import { formatQuantity } from '../services/format';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PantryItem, RecipeAvailability } from '../types/api';

export default function PantryScreen() {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState('');

  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });

  const receitas = useQuery({
    queryKey: ['recipe-suggestions'],
    queryFn: () => readRecipeSuggestions(),
  });

  /** Depois de mexer na despensa, as receitas mudam junto. */
  function recarregar() {
    cliente.invalidateQueries({ queryKey: ['pantry'] });
    cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
  }

  const adicionar = useMutation({
    mutationFn: (descricao: string) => addPantryItem({ raw_description: descricao }),
    onSuccess: () => {
      setTexto('');
      recarregar();
    },
  });

  const remover = useMutation({
    mutationFn: (itemId: string) => removePantryItem(itemId),
    onSuccess: recarregar,
  });

  const itens = despensa.data ?? [];
  const semVinculo = itens.filter((item) => item.product === null).length;

  return (
    <FlatList
      data={receitas.data ?? []}
      keyExtractor={(item) => item.recipe.id}
      contentContainerStyle={styles.conteudo}
      ListHeaderComponent={
        <View style={styles.topo}>
          <View style={styles.cabecalho}>
            <Chip label="APROVEITAMENTO INTELIGENTE" tone="success" />
            <Text style={styles.titulo}>O que tem na sua casa?</Text>
            <Body muted>
              Aproveite o que já está na despensa e na geladeira para preparar refeições
              da sua dieta sem gastar a mais.
            </Body>
          </View>

          <Card style={styles.cartaoDespensa}>
            <View style={styles.linhaTitulo}>
              <SectionTitle>Minha despensa</SectionTitle>
              <Chip label={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`} />
            </View>

            <View style={styles.campoLinha}>
              <TextInput
                accessibilityLabel="Adicionar ingrediente"
                placeholder="Ex: ovos, aveia, tomate…"
                placeholderTextColor={colors.outline}
                style={styles.campo}
                value={texto}
                onChangeText={setTexto}
                onSubmitEditing={() => texto.trim() && adicionar.mutate(texto.trim())}
                returnKeyType="done"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Adicionar à despensa"
                disabled={!texto.trim() || adicionar.isPending}
                onPress={() => adicionar.mutate(texto.trim())}
                style={({ pressed }) => [
                  styles.botaoAdicionar,
                  (!texto.trim() || adicionar.isPending) && styles.botaoInativo,
                  pressed && styles.botaoPressionado,
                ]}
              >
                {adicionar.isPending ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.botaoAdicionarTexto}>+</Text>
                )}
              </Pressable>
            </View>

            {adicionar.isError ? (
              <ErrorNotice
                message={
                  adicionar.error instanceof ApiError
                    ? adicionar.error.message
                    : 'não foi possível adicionar'
                }
              />
            ) : null}

            {despensa.isPending ? <Body muted>Carregando sua despensa…</Body> : null}
            {despensa.isError ? <ErrorNotice message="não foi possível ler a despensa" /> : null}

            {!despensa.isPending && itens.length === 0 ? (
              <Body muted>
                Sua despensa está vazia. Adicione o que já tem em casa para descontar da
                compra e ver o que dá para cozinhar.
              </Body>
            ) : null}

            <View style={styles.chips}>
              {itens.map((item) => (
                <ChipDaDespensa
                  key={item.id}
                  item={item}
                  onRemove={() => remover.mutate(item.id)}
                />
              ))}
            </View>

            {semVinculo > 0 ? (
              <Body muted>
                {semVinculo === 1
                  ? '1 item ainda não foi ligado a um produto do mercado, então não desconta da sua lista de compras.'
                  : `${semVinculo} itens ainda não foram ligados a produtos do mercado, então não descontam da sua lista de compras.`}
              </Body>
            ) : null}
          </Card>

          <View style={styles.linhaTitulo}>
            <SectionTitle>Sugestões de receita</SectionTitle>
          </View>

          {receitas.isPending ? <Body muted>Procurando receitas…</Body> : null}
          {receitas.isError ? <ErrorNotice message="não foi possível buscar receitas" /> : null}
        </View>
      }
      renderItem={({ item }) => <CartaoDeReceita disponibilidade={item} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
    />
  );
}

function ChipDaDespensa({ item, onRemove }: { item: PantryItem; onRemove: () => void }) {
  const vinculado = item.product !== null;
  const quantidade =
    item.quantity && item.unit ? formatQuantity(item.quantity, item.unit) : null;

  return (
    <View style={[styles.chipItem, !vinculado && styles.chipItemSolto]}>
      <View style={[styles.ponto, vinculado ? styles.pontoVinculado : styles.pontoSolto]} />
      <Text style={styles.chipItemTexto} numberOfLines={1}>
        {item.raw_description}
        {quantidade ? ` (${quantidade})` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover ${item.raw_description}`}
        onPress={onRemove}
        hitSlop={12}
      >
        <Text style={styles.chipItemRemover}>✕</Text>
      </Pressable>
    </View>
  );
}

function CartaoDeReceita({ disponibilidade }: { disponibilidade: RecipeAvailability }) {
  const [aberto, setAberto] = useState(false);
  const { recipe, percentage, complete, missing } = disponibilidade;

  return (
    <Card style={styles.receita}>
      <View style={styles.linhaTitulo}>
        <Text style={styles.receitaNome}>{recipe.name}</Text>
        <Chip
          label={complete ? '100% disponível' : `${percentage}% disponível`}
          tone={complete ? 'success' : 'warning'}
        />
      </View>

      <ProgressBar percent={percentage} />

      <Text style={styles.receitaDetalhe}>
        {recipe.prep_minutes ? `${recipe.prep_minutes} minutos` : 'tempo não informado'}
        {recipe.servings ? ` · rende ${recipe.servings}` : ''}
      </Text>

      {missing.length > 0 ? (
        <Text style={styles.faltando}>
          Falta: {missing.map((item) => item.product.name).join(', ')}
        </Text>
      ) : (
        <Text style={styles.completa}>Dá para fazer com o que você já tem.</Text>
      )}

      {recipe.instructions ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAberto((estava) => !estava)}
            style={styles.verPreparo}
          >
            <Text style={styles.verPreparoTexto}>
              {aberto ? 'Ocultar preparo' : 'Ver modo de preparo'}
            </Text>
          </Pressable>
          {aberto ? <Text style={styles.preparo}>{recipe.instructions}</Text> : null}
        </>
      ) : null}

      {recipe.is_fictitious ? (
        <Chip label="receita fictícia de desenvolvimento" tone="warning" />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, paddingBottom: spacing.xl3 },
  topo: { gap: spacing.md, marginBottom: spacing.sm },
  cabecalho: { gap: spacing.xs },
  titulo: { ...typography.headlineLg, color: colors.primary },

  cartaoDespensa: { gap: spacing.sm },
  linhaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },

  campoLinha: { flexDirection: 'row', gap: spacing.xs },
  campo: {
    flex: 1,
    minHeight: MIN_TOUCH_HEIGHT,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  botaoAdicionar: {
    width: MIN_TOUCH_HEIGHT,
    height: MIN_TOUCH_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoInativo: { opacity: 0.4 },
  botaoPressionado: { transform: [{ scale: 0.98 }] },
  botaoAdicionarTexto: { ...typography.headlineSm, color: colors.onPrimary },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.full,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    maxWidth: '100%',
  },
  // Contorno tracejado marca o item que ainda não abate da compra.
  chipItemSolto: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.outlineVariant },
  ponto: { width: 6, height: 6, borderRadius: radius.full },
  pontoVinculado: { backgroundColor: colors.primaryContainer },
  pontoSolto: { backgroundColor: colors.secondaryContainer },
  chipItemTexto: { ...typography.labelMd, color: colors.onSurface, flexShrink: 1 },
  chipItemRemover: { ...typography.labelMd, color: colors.outline },

  receita: { gap: spacing.xs },
  receitaNome: { ...typography.headlineSm, color: colors.primary, flex: 1 },
  receitaDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  faltando: { ...typography.bodySm, color: colors.onSecondaryFixedVariant },
  completa: { ...typography.bodySm, color: colors.onPrimaryFixedVariant },
  verPreparo: { paddingVertical: spacing.xs },
  verPreparoTexto: { ...typography.labelLg, color: colors.primary },
  preparo: { ...typography.bodySm, color: colors.onSurfaceVariant },
});
