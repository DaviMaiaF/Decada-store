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
 *
 * A aba é também uma etapa da trilha. "Voltar" devolve a pessoa para onde ela
 * estava (o Mercado, se veio da pergunta de lá, ou o início), e "Concluí a
 * despensa" cumpre a etapa e leva à próxima.
 */

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Body, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import { ConclusaoDaDespensa } from '../components/ConclusaoDaDespensa';
import { DespensaDoPlano } from '../components/DespensaDoPlano';
import { Entrada, useCascata } from '../components/Entrada';
import { DespensaPorFoto } from '../components/DespensaPorFoto';
import { Tocavel } from '../components/Tocavel';
import { SeletorDeUnidade } from '../components/SeletorDeUnidade';
import { formatQuantity } from '../services/format';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PantryItem, ProductSuggestion, RecipeAvailability } from '../types/api';
import { usePantryViewModel, useRecipeCardViewModel } from '../viewmodels/usePantryViewModel';

// O teste da tela espera a recarga das receitas por este tempo.
export { ESPERA_DAS_RECEITAS } from '../viewmodels/usePantryViewModel';

export default function PantryScreen({
  listId,
  planId,
  onVoltar,
  onConcluida,
}: {
  listId: string | null;
  /** O plano ativo: dele sai a pergunta "você tem isto em casa?". */
  planId: string | null;
  /** De volta para onde a pessoa estava antes de abrir a aba. */
  onVoltar: () => void;
  /** Etapa concluída: segue para a próxima, a região. */
  onConcluida: () => void;
}) {
  const vm = usePantryViewModel(listId);
  const { itens, adicao, edicao, semVinculo, semQuantidade } = vm;
  const { escolhendo, medindo } = adicao;
  const { editando } = edicao;
  // Item acrescentado ou receita recarregada entra na hora, sem esperar a vez.
  const cascataDosItens = useCascata(itens.length > 0);
  const cascataDasReceitas = useCascata(vm.receitas.length > 0);

  return (
    <FlatList
      data={vm.receitas}
      keyExtractor={(item) => item.recipe.id}
      contentContainerStyle={styles.conteudo}
      ListHeaderComponent={
        <View style={styles.topo}>
          <Tocavel
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={onVoltar}
            style={styles.voltar}
          >
            <Text style={styles.voltarTexto}>‹ Voltar</Text>
          </Tocavel>

          <View style={styles.cabecalho}>
            <Chip label="APROVEITAMENTO INTELIGENTE" tone="success" />
            <Text style={styles.titulo}>O que tem na sua casa?</Text>
            <Body muted>
              Aproveite o que já está na despensa e na geladeira para preparar refeições
              da sua dieta sem gastar a mais.
            </Body>
          </View>

          <DespensaDoPlano planId={planId} />

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
                value={adicao.texto}
                onChangeText={adicao.setTexto}
                onSubmitEditing={adicao.comecarEscolha}
                returnKeyType="done"
              />
              <Tocavel
                accessibilityRole="button"
                accessibilityLabel="Adicionar à despensa"
                disabled={!adicao.podeComecar}
                onPress={adicao.comecarEscolha}
                style={[styles.botaoAdicionar, !adicao.podeComecar && styles.botaoInativo]}
              >
                {adicao.salvando ? (
                  <ActivityIndicator color={colors.onPrimary} />
                ) : (
                  <Text style={styles.botaoAdicionarTexto}>+</Text>
                )}
              </Tocavel>
            </View>

            <DespensaPorFoto onAdicionado={vm.guardadoPelaFoto} />

            {escolhendo !== null ? (
              <View style={styles.escolha}>
                <Text style={styles.escolhaTitulo}>Qual produto é "{escolhendo}"?</Text>
                <Body muted>
                  Escolher o produto é o que faz este item descontar da sua lista de
                  compras e contar nas receitas.
                </Body>

                {adicao.buscando ? <Body muted>Buscando no catálogo…</Body> : null}
                {adicao.buscaFalhou ? (
                  <ErrorNotice message="não foi possível buscar no catálogo" />
                ) : null}

                {adicao.candidatos?.map((sugestao: ProductSuggestion) => (
                  <Pressable
                    key={sugestao.product.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Usar ${sugestao.product.name}`}
                    disabled={adicao.salvando}
                    onPress={() => adicao.escolherProduto(sugestao.product)}
                    style={styles.candidato}
                  >
                    <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
                    <Text style={styles.candidatoDetalhe}>
                      {Math.round(Number(sugestao.score) * 100)}% de semelhança
                    </Text>
                  </Pressable>
                ))}

                {adicao.candidatos?.length === 0 ? (
                  <Body muted>Nenhum produto do catálogo se parece com isso.</Body>
                ) : null}

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={adicao.guardarSoTexto}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Guardar só como texto</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={adicao.cancelarEscolha}
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
                    value={adicao.quantidade}
                    onChangeText={adicao.setQuantidade}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                  />
                  <SeletorDeUnidade
                    produto={medindo.produto}
                    escolhida={adicao.unidade}
                    onEscolher={adicao.setUnidade}
                  />
                </View>

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Salvar na despensa"
                    disabled={!adicao.quantidadeValida || adicao.salvando}
                    onPress={adicao.salvarComQuantidade}
                    style={[styles.acaoSecundaria, !adicao.quantidadeValida && styles.botaoInativo]}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Salvar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={adicao.salvando}
                    onPress={adicao.salvarSemQuantidade}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Não sei a quantidade</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={adicao.cancelarMedida}
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

                {edicao.produto === null ? (
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
                      value={edicao.busca}
                      onChangeText={edicao.setBusca}
                    />
                    {edicao.candidatos?.map((sugestao: ProductSuggestion) => (
                      <Pressable
                        key={sugestao.product.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Usar ${sugestao.product.name}`}
                        onPress={() => edicao.escolherProduto(sugestao.product)}
                        style={styles.candidato}
                      >
                        <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
                        <Text style={styles.candidatoDetalhe}>
                          {Math.round(Number(sugestao.score) * 100)}% de semelhança
                        </Text>
                      </Pressable>
                    ))}
                    {edicao.candidatos?.length === 0 ? (
                      <Body muted>Nenhum produto do catálogo se parece com isso.</Body>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Body muted>
                      {edicao.produto.name} · deixe a quantidade em branco se não souber
                      quanto tem.
                    </Body>
                    <View style={styles.medidaLinha}>
                      <TextInput
                        accessibilityLabel="Quantidade"
                        placeholder="Quantidade"
                        placeholderTextColor={colors.outline}
                        style={[styles.campo, styles.campoQuantidade]}
                        value={edicao.quantidade}
                        onChangeText={edicao.setQuantidade}
                        keyboardType="decimal-pad"
                        returnKeyType="done"
                      />
                      <SeletorDeUnidade
                        produto={edicao.produto}
                        escolhida={edicao.unidade}
                        onEscolher={edicao.setUnidade}
                      />
                    </View>
                  </>
                )}

                <View style={styles.escolhaAcoes}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Salvar medição"
                    disabled={edicao.medidaInvalida || edicao.salvando}
                    onPress={edicao.salvar}
                    style={[styles.acaoSecundaria, edicao.medidaInvalida && styles.botaoInativo]}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Salvar medição</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={edicao.cancelar}
                    style={styles.acaoSecundaria}
                  >
                    <Text style={styles.acaoSecundariaTexto}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {edicao.erro ? <ErrorNotice message={edicao.erro} /> : null}
            {adicao.erro ? <ErrorNotice message={adicao.erro} /> : null}

            {vm.carregando ? <Body muted>Carregando sua despensa…</Body> : null}
            {vm.falhou ? <ErrorNotice message="não foi possível ler a despensa" /> : null}

            {!vm.carregando && itens.length === 0 ? (
              <Body muted>
                Sua despensa está vazia. Adicione o que já tem em casa para descontar da
                compra e ver o que dá para cozinhar.
              </Body>
            ) : null}

            {itens.length > 0 ? (
              <Body muted>Toque em um item para vincular o produto ou medir.</Body>
            ) : null}

            <View style={styles.chips}>
              {itens.map((item, indice) => (
                <Entrada key={item.id} atraso={cascataDosItens(indice)}>
                  <ChipDaDespensa
                    item={item}
                    onPress={() => edicao.abrir(item)}
                    onRemove={() => vm.remover(item.id)}
                  />
                </Entrada>
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

          {/* Logo depois do cadastro, antes das receitas: é onde a pessoa acaba de
              dizer o que tem em casa. */}
          <ConclusaoDaDespensa planId={planId} onConcluida={onConcluida} />

          <View style={styles.linhaTitulo}>
            <SectionTitle>Sugestões de receita</SectionTitle>
          </View>

          {vm.buscandoReceitas ? <Body muted>Procurando receitas…</Body> : null}
          {vm.receitasFalharam ? <ErrorNotice message="não foi possível buscar receitas" /> : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <Entrada atraso={cascataDasReceitas(index)}>
          <CartaoDeReceita disponibilidade={item} listId={listId} naLista={vm.naLista} />
        </Entrada>
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
    />
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

  // Os dois toques são irmãos, e não um dentro do outro: na versão web cada
  // `Pressable` vira um `<button>`, e botão aninhado é HTML inválido — o React
  // acusa erro de hidratação, e o clique no ✕ ainda dispara o toque de fora.
  return (
    <View style={[styles.chipItem, !vinculado && styles.chipItemSolto]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Item ${item.raw_description}`}
        accessibilityHint="Abre o produto e a quantidade deste item"
        onPress={onPress}
        style={styles.chipItemToque}
      >
        <View style={[styles.ponto, vinculado ? styles.pontoVinculado : styles.pontoSolto]} />
        <Text style={styles.chipItemTexto} numberOfLines={1}>
          {item.raw_description}
          {quantidade ? ` (${quantidade})` : ''}
        </Text>
      </Pressable>
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

function CartaoDeReceita({
  disponibilidade,
  listId,
  naLista,
}: {
  disponibilidade: RecipeAvailability;
  /** Nulo enquanto não há lista de compras: sem ela não há onde acrescentar. */
  listId: string | null;
  /** Ids dos produtos que a lista de compras já tem. */
  naLista: Set<string>;
}) {
  const vm = useRecipeCardViewModel(disponibilidade, listId, naLista);
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
        <>
          <Text style={styles.faltando}>
            Falta: {missing.map((item) => item.product.name).join(', ')}
          </Text>

          {!vm.temLista ? (
            <Body muted>
              Gere sua lista de compras na aba Mercado para acrescentar o que falta.
            </Body>
          ) : (
            <>
              <View style={styles.faltantes}>
                {vm.acrescentaveis.map((ingrediente) => (
                    <Tocavel
                      key={ingrediente.product.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Acrescentar ${ingrediente.product.name} à lista de compras`}
                      disabled={vm.acrescentando}
                      onPress={() => vm.acrescentar(ingrediente)}
                      style={[styles.botaoFaltante, vm.acrescentando && styles.botaoInativo]}
                    >
                      <Text style={styles.botaoFaltanteTexto}>+ {ingrediente.product.name}</Text>
                    </Tocavel>
                  ))}
              </View>

              {/* O que já está na lista falta por quantidade, não por ausência:
                  acrescentar de novo seria recusado, e sem esta linha o botão
                  sumiria sem explicar por quê. */}
              {vm.quantosJaNaLista > 0 ? (
                <Body muted>
                  {vm.jaNaLista} {vm.quantosJaNaLista === 1 ? 'já está' : 'já estão'} na sua lista, em
                  quantidade menor do que esta receita pede.
                </Body>
              ) : null}
            </>
          )}

          {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
        </>
      ) : (
        <Text style={styles.completa}>Dá para fazer com o que você já tem.</Text>
      )}

      {recipe.instructions ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={vm.alternarPreparo}
            style={styles.verPreparo}
          >
            <Text style={styles.verPreparoTexto}>
              {vm.aberto ? 'Ocultar preparo' : 'Ver modo de preparo'}
            </Text>
          </Pressable>
          {vm.aberto ? <Text style={styles.preparo}>{recipe.instructions}</Text> : null}
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
  voltar: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  voltarTexto: { ...typography.labelLg, color: colors.primary },
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
  chipItemToque: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
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
  faltantes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  botaoFaltante: {
    minHeight: MIN_TOUCH_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.secondaryContainer,
  },
  botaoFaltanteTexto: { ...typography.labelLg, color: colors.onSecondaryContainer },
  completa: { ...typography.bodySm, color: colors.onPrimaryFixedVariant },
  verPreparo: { paddingVertical: spacing.xs },
  verPreparoTexto: { ...typography.labelLg, color: colors.primary },
  preparo: { ...typography.bodySm, color: colors.onSurfaceVariant },
});
