/**
 * Despensa e receitas — a aba "O que tem na sua casa?" do protótipo.
 *
 * As duas coisas moram na mesma tela porque uma existe por causa da outra: a
 * lista do que está em casa e o que dá para cozinhar com isso.
 *
 * Ao adicionar, a pessoa escolhe qual produto do catálogo é aquilo e diz quanto
 * tem. Sem o vínculo o item não abate da lista de compras nem conta para as
 * receitas; sem a quantidade ele conta para as receitas mas não abate nada. Um
 * item que não faz nada é pior que dois toques a mais no cadastro.
 *
 * A quantidade continua opcional: "tenho azeite" é informação válida sem número,
 * e guardar só como texto continua possível para o que não existe no catálogo.
 * Nos dois casos a tela avisa o que aquele item deixa de fazer.
 *
 * O que ficou pela metade não fica preso assim: tocar em um item já salvo abre o
 * mesmo par produto + quantidade, e é por ali que o item solto passa a abater.
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
import { amountToField, parseDecimal, suggestedAmount, unitOptions } from '../services/units';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type {
  MeasurementUnit,
  PantryItem,
  Product,
  ProductSuggestion,
  RecipeAvailability,
} from '../types/api';

export default function PantryScreen() {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState('');
  // Texto aguardando a escolha do produto. Nulo quando não há nada em curso.
  const [escolhendo, setEscolhendo] = useState<string | null>(null);
  // Produto já escolhido, aguardando a quantidade. Segundo e último passo.
  const [medindo, setMedindo] = useState<{ descricao: string; produto: Product } | null>(
    null,
  );
  const [quantidade, setQuantidade] = useState('');
  const [unidade, setUnidade] = useState<MeasurementUnit>('unidade');
  // Item já salvo em edição, com estado próprio: os dois painéis nunca estão
  // abertos ao mesmo tempo, mas compartilhar os campos deixaria um sujar o outro.
  const [editando, setEditando] = useState<PantryItem | null>(null);
  const [buscaEdicao, setBuscaEdicao] = useState('');
  const [produtoEdicao, setProdutoEdicao] = useState<Product | null>(null);
  const [quantidadeEdicao, setQuantidadeEdicao] = useState('');
  const [unidadeEdicao, setUnidadeEdicao] = useState<MeasurementUnit>('unidade');

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
    mutationFn: ({
      descricao,
      produtoId,
      medida,
    }: {
      descricao: string;
      produtoId: string | null;
      medida?: { quantidade: string; unidade: MeasurementUnit } | null;
    }) =>
      addPantryItem({
        raw_description: descricao,
        product_id: produtoId,
        // O backend recusa o par pela metade, então ou vão os dois ou nenhum.
        ...(medida ? { quantity: medida.quantidade, unit: medida.unidade } : {}),
      }),
    onSuccess: () => {
      setTexto('');
      setEscolhendo(null);
      setMedindo(null);
      recarregar();
    },
  });

  function comecarEscolha() {
    const descricao = texto.trim();
    if (descricao.length < 2) return;
    setEscolhendo(descricao);
  }

  /** Produto escolhido: falta dizer quanto se tem dele. */
  function comecarMedida(descricao: string, produto: Product) {
    const sugestao = suggestedAmount(produto);
    setQuantidade(sugestao.quantity);
    setUnidade(sugestao.unit);
    setMedindo({ descricao, produto });
    setEscolhendo(null);
  }

  function salvarMedido(comQuantidade: boolean) {
    if (medindo === null) return;
    const numero = comQuantidade ? parseDecimal(quantidade) : null;
    adicionar.mutate({
      descricao: medindo.descricao,
      produtoId: medindo.produto.id,
      medida: numero === null ? null : { quantidade: numero, unidade },
    });
  }

  const atualizar = useMutation({
    mutationFn: ({
      itemId,
      produtoId,
      medida,
    }: {
      itemId: string;
      produtoId: string | null;
      medida: { quantidade: string; unidade: MeasurementUnit } | null;
    }) =>
      updatePantryItem(itemId, {
        product_id: produtoId,
        // Aqui os dois campos vão sempre, inclusive nulos: nulo nos dois é como
        // se diz "não sei mais a quantidade" e apaga a medição que havia.
        quantity: medida === null ? null : medida.quantidade,
        unit: medida === null ? null : medida.unidade,
      }),
    onSuccess: () => {
      setEditando(null);
      recarregar();
    },
  });

  /** Tocar no item abre o mesmo par produto + quantidade, já preenchido. */
  function abrirEdicao(item: PantryItem) {
    setEditando(item);
    setProdutoEdicao(item.product);
    setBuscaEdicao('');
    setEscolhendo(null);
    setMedindo(null);

    if (item.product !== null && item.quantity !== null && item.unit !== null) {
      setQuantidadeEdicao(amountToField(item.quantity));
      setUnidadeEdicao(item.unit);
      return;
    }
    const sugestao =
      item.product === null
        ? { quantity: '', unit: 'unidade' as MeasurementUnit }
        : suggestedAmount(item.product);
    setQuantidadeEdicao(sugestao.quantity);
    setUnidadeEdicao(sugestao.unit);
  }

  /** Produto escolhido na edição: a unidade passa a ser a da grandeza dele. */
  function escolherProdutoEdicao(produto: Product) {
    const sugestao = suggestedAmount(produto);
    setProdutoEdicao(produto);
    setQuantidadeEdicao(sugestao.quantity);
    setUnidadeEdicao(sugestao.unit);
  }

  function salvarEdicao() {
    if (editando === null) return;
    // Campo vazio é "não sei a quantidade", e apaga a medição. Texto que não é
    // número não chega aqui: o botão fica inativo antes disso.
    const numero = quantidadeEdicao.trim() === '' ? null : parseDecimal(quantidadeEdicao);
    atualizar.mutate({
      itemId: editando.id,
      produtoId: produtoEdicao === null ? null : produtoEdicao.id,
      medida: numero === null ? null : { quantidade: numero, unidade: unidadeEdicao },
    });
  }

  const remover = useMutation({
    mutationFn: (itemId: string) => removePantryItem(itemId),
    onSuccess: recarregar,
  });

  const itens = despensa.data ?? [];
  const semVinculo = itens.filter((item) => item.product === null).length;
  // Item vinculado mas sem quantidade conta para as receitas e não abate nada
  // da compra. Sem este aviso a pessoa acha que o vínculo bastava.
  const semQuantidade = itens.filter(
    (item) => item.product !== null && (item.quantity === null || item.unit === null),
  ).length;
  // Campo vazio é intenção ("não sei"); texto que não é número é erro de digitação,
  // e gravar nulo por causa dele apagaria a medição sem a pessoa pedir.
  const medidaEdicaoInvalida =
    quantidadeEdicao.trim() !== '' && parseDecimal(quantidadeEdicao) === null;

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
                    onPress={() => comecarMedida(escolhendo, sugestao.product)}
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

            {medindo !== null ? (
              <View style={styles.escolha}>
                <Text style={styles.escolhaTitulo}>
                  Quanto de {medindo.produto.name} você tem?
                </Text>
                <Body muted>
                  A quantidade é o que faz este item descontar da sua compra. Sem ela o
                  item fica guardado e conta só para as receitas.
                </Body>

                <View style={styles.medidaLinha}>
                  <TextInput
                    accessibilityLabel="Quantidade"
                    placeholder="0"
                    placeholderTextColor={colors.outline}
                    style={[styles.campo, styles.campoQuantidade]}
                    value={quantidade}
                    onChangeText={setQuantidade}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  <SeletorDeUnidade
                    produto={medindo.produto}
                    escolhida={unidade}
                    onEscolher={setUnidade}
                  />
                </View>

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Salvar na despensa"
                    disabled={parseDecimal(quantidade) === null || adicionar.isPending}
                    onPress={() => salvarMedido(true)}
                    style={[
                      styles.acaoSecundaria,
                      parseDecimal(quantidade) === null && styles.botaoInativo,
                    ]}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Salvar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={adicionar.isPending}
                    onPress={() => salvarMedido(false)}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Não sei a quantidade</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMedindo(null)}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {editando !== null ? (
              <View style={styles.escolha}>
                <Text style={styles.escolhaTitulo}>
                  Medir ou vincular: "{editando.raw_description}"
                </Text>

                {produtoEdicao === null ? (
                  <>
                    <Body muted>
                      Primeiro diga qual produto é este item. A quantidade só desconta
                      depois que existe um produto para descontar.
                    </Body>
                    <TextInput
                      accessibilityLabel="Buscar produto"
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
                        accessibilityLabel={`Usar ${sugestao.product.name}`}
                        onPress={() => escolherProdutoEdicao(sugestao.product)}
                        style={styles.candidato}
                      >
                        <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
                        <Text style={styles.candidatoDetalhe}>
                          {Math.round(Number(sugestao.score) * 100)}% de semelhança
                        </Text>
                      </Pressable>
                    ))}
                    {candidatosEdicao.data?.length === 0 ? (
                      <Body muted>Nenhum produto do catálogo se parece com isso.</Body>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Body muted>
                      {produtoEdicao.name} · deixe a quantidade em branco se não souber
                      quanto tem.
                    </Body>
                    <View style={styles.medidaLinha}>
                      <TextInput
                        accessibilityLabel="Quantidade"
                        placeholder="Quantidade"
                        placeholderTextColor={colors.outline}
                        style={[styles.campo, styles.campoQuantidade]}
                        value={quantidadeEdicao}
                        onChangeText={setQuantidadeEdicao}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                      />
                      <SeletorDeUnidade
                        produto={produtoEdicao}
                        escolhida={unidadeEdicao}
                        onEscolher={setUnidadeEdicao}
                      />
                    </View>
                  </>
                )}

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Salvar medição"
                    disabled={medidaEdicaoInvalida || atualizar.isPending}
                    onPress={salvarEdicao}
                    style={[styles.acaoSecundaria, medidaEdicaoInvalida && styles.botaoInativo]}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Salvar medição</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setEditando(null)}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {atualizar.isError ? (
              <ErrorNotice
                message={
                  atualizar.error instanceof ApiError
                    ? atualizar.error.message
                    : 'não foi possível salvar a medição'
                }
              />
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

            {semQuantidade > 0 ? (
              <Body muted>
                {semQuantidade === 1
                  ? '1 item está ligado a um produto mas não tem quantidade, então também não desconta da sua lista de compras.'
                  : `${semQuantidade} itens estão ligados a produtos mas não têm quantidade, então também não descontam da sua lista de compras.`}
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

/**
 * Unidades compatíveis com a grandeza em que o produto é vendido.
 *
 * Produto vendido por unidade não tem escolha a fazer — mostra o rótulo e
 * pronto, em vez de um seletor de uma opção só.
 */
function SeletorDeUnidade({
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

/**
 * O chip é o botão de corrigir o item, não só de ver.
 *
 * Quem cadastrou às pressas — sem produto ou sem quantidade — precisa de um
 * caminho de volta, e o próprio chip já marca visualmente o que está incompleto.
 */
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
  escolhaAcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  medidaLinha: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  campoQuantidade: { flex: 0, minWidth: 96 },
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
  acaoSecundaria: { minHeight: MIN_TOUCH_HEIGHT, justifyContent: 'center' },
  acaoSecundariaTexto: { ...typography.labelLg, color: colors.primary },

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
