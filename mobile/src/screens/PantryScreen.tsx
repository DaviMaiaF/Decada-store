/**
 * Despensa e receitas — a aba "O que tem na sua casa?" do protótipo.
 *
 * Ao adicionar, a pessoa escolhe qual produto do catálogo é aquilo. Sem esse
 * vínculo o item não abate da lista de compras nem conta para as receitas.
 *
 * Tocar em um item salvo permite vincular e medir (Tarefa 1).
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
  searchProducts,
  updatePantryItem,
} from '../services/api';
import { formatQuantity } from '../services/format';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PantryItem, ProductSuggestion, RecipeAvailability } from '../types/api';

const UNIDADES = ['g', 'kg', 'ml', 'l', 'unidade'];

export default function PantryScreen() {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState('');
  const [escolhendo, setEscolhendo] = useState<string | null>(null);

  // Estado para medir/vincular item já salvo
  const [itemEditando, setItemEditando] = useState<PantryItem | null>(null);
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState('g');
  const [buscaEdicao, setBuscaEdicao] = useState('');
  const [produtoEscolhido, setProdutoEscolhido] = useState<string | null>(null);

  const despensa = useQuery({ queryKey: ['pantry'], queryFn: readPantry });

  const receitas = useQuery({
    queryKey: ['recipe-suggestions'],
    queryFn: () => readRecipeSuggestions(),
  });

  function recarregar() {
    cliente.invalidateQueries({ queryKey: ['pantry'] });
    cliente.invalidateQueries({ queryKey: ['recipe-suggestions'] });
  }

  const candidatos = useQuery({
    queryKey: ['product-search', escolhendo],
    queryFn: () => searchProducts(escolhendo!),
    enabled: escolhendo !== null,
  });

  const candidatosEdicao = useQuery({
    queryKey: ['product-search', buscaEdicao],
    queryFn: () => searchProducts(buscaEdicao),
    enabled: buscaEdicao.trim().length >= 2,
  });

  const adicionar = useMutation({
    mutationFn: ({ descricao, produtoId }: { descricao: string; produtoId: string | null }) =>
      addPantryItem({ raw_description: descricao, product_id: produtoId }),
    onSuccess: () => {
      setTexto('');
      setEscolhendo(null);
      recarregar();
    },
  });

  const atualizar = useMutation({
    mutationFn: (dados: {
      itemId: string;
      productId: string | null;
      quantity: string | null;
      unit: string | null;
    }) =>
      updatePantryItem(dados.itemId, {
        product_id: dados.productId,
        quantity: dados.quantity,
        unit: dados.unit,
      }),
    onSuccess: () => {
      setItemEditando(null);
      recarregar();
    },
  });

  function comecarEscolha() {
    const descricao = texto.trim();
    if (descricao.length < 2) return;
    setEscolhendo(descricao);
  }

  function abrirEdicao(item: PantryItem) {
    setItemEditando(item);
    setQuantidade(item.quantity ? String(item.quantity) : '');
    setUnidade(item.unit ?? 'g');
    setProdutoEscolhido(item.product ? item.product.id : null);
    setBuscaEdicao('');
  }

  function salvarEdicao() {
    if (!itemEditando) return;
    const qtdTrim = quantidade.trim();
    atualizar.mutate({
      itemId: itemEditando.id,
      productId: produtoEscolhido ?? (itemEditando.product ? itemEditando.product.id : null),
      quantity: qtdTrim ? qtdTrim : null,
      unit: qtdTrim ? unidade : null,
    });
  }

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
                onSubmitEditing={comecarEscolha}
                returnKeyType="done"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Adicionar à despensa"
                disabled={texto.trim().length < 2 || adicionar.isPending}
                onPress={comecarEscolha}
                style={({ pressed }) => [
                  styles.botaoAdicionar,
                  (texto.trim().length < 2 || adicionar.isPending) && styles.botaoInativo,
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

            {escolhendo !== null ? (
              <View style={styles.escolha}>
                <Text style={styles.escolhaTitulo}>Qual produto é "{escolhendo}"?</Text>
                <Body muted>
                  Escolher o produto é o que faz este item descontar da sua lista de
                  compras e contar nas receitas.
                </Body>

                {candidatos.isPending ? <Body muted>Buscando no catálogo…</Body> : null}
                {candidatos.isError ? (
                  <ErrorNotice message="não foi possível buscar no catálogo" />
                ) : null}

                {candidatos.data?.map((sugestao: ProductSuggestion) => (
                  <Pressable
                    key={sugestao.product.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar ${sugestao.product.name}`}
                    disabled={adicionar.isPending}
                    onPress={() =>
                      adicionar.mutate({
                        descricao: escolhendo,
                        produtoId: sugestao.product.id,
                      })
                    }
                    style={styles.candidato}
                  >
                    <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
                    <Text style={styles.candidatoDetalhe}>
                      {Math.round(Number(sugestao.score) * 100)}% de semelhança
                    </Text>
                  </Pressable>
                ))}

                {candidatos.data?.length === 0 ? (
                  <Body muted>Nenhum produto do catálogo se parece com isso.</Body>
                ) : null}

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      adicionar.mutate({ descricao: escolhendo, produtoId: null })
                    }
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Guardar só como texto</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setEscolhendo(null)}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* Painel de Medir ou Vincular Item Já Salvo */}
            {itemEditando !== null ? (
              <View style={styles.escolha}>
                <Text style={styles.escolhaTitulo}>
                  Medir ou vincular: "{itemEditando.raw_description}"
                </Text>

                {!itemEditando.product && !produtoEscolhido ? (
                  <>
                    <TextInput
                      placeholder="Buscar produto no catálogo…"
                      placeholderTextColor={colors.outline}
                      style={styles.campo}
                      value={buscaEdicao}
                      onChangeText={setBuscaEdicao}
                    />
                    {candidatosEdicao.data?.map((sugestao: ProductSuggestion) => (
                      <Pressable
                        key={sugestao.product.id}
                        accessibilityRole="button"
                        onPress={() => setProdutoEscolhido(sugestao.product.id)}
                        style={styles.candidato}
                      >
                        <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
                      </Pressable>
                    ))}
                  </>
                ) : null}

                <View style={styles.campoLinha}>
                  <TextInput
                    placeholder="Quantidade"
                    placeholderTextColor={colors.outline}
                    keyboardType="numeric"
                    style={[styles.campo, { flex: 1 }]}
                    value={quantidade}
                    onChangeText={setQuantidade}
                  />
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {UNIDADES.map((u) => (
                      <Pressable
                        key={u}
                        onPress={() => setUnidade(u)}
                        style={[
                          styles.chipUnidade,
                          unidade === u && styles.chipUnidadeAtivo,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipUnidadeTexto,
                            unidade === u && styles.chipUnidadeTextoAtivo,
                          ]}
                        >
                          {u}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={salvarEdicao}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Salvar medição</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setItemEditando(null)}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

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
                  onPress={() => abrirEdicao(item)}
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

function ChipDaDespensa({
  item,
  onPress,
  onRemove,
}: {
  item: PantryItem;
  onPress: () => void;
  onRemove: () => void;
}) {
  const vinculado = item.product !== null;
  const quantidade =
    item.quantity && item.unit ? formatQuantity(item.quantity, item.unit) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Item ${item.raw_description}`}
      onPress={onPress}
      style={[styles.chipItem, !vinculado && styles.chipItemSolto]}
    >
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
    </Pressable>
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

  escolha: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  escolhaTitulo: { ...typography.labelLg, color: colors.onSurface },
  candidato: {
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  candidatoNome: { ...typography.labelLg, color: colors.onSurface },
  candidatoDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  escolhaAcoes: { flexDirection: 'row', gap: spacing.sm },
  acaoSecundaria: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  acaoSecundariaTexto: { ...typography.labelLg, color: colors.primary },

  chipUnidade: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerLowest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipUnidadeAtivo: { backgroundColor: colors.primaryContainer },
  chipUnidadeTexto: { ...typography.labelSm, color: colors.onSurface },
  chipUnidadeTextoAtivo: { color: colors.onPrimary, fontWeight: 'bold' },

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