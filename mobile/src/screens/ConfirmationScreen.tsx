/**
 * Confirmação do casamento item–produto.
 *
 * É a tela onde a regra mais importante do projeto aparece: o servidor sugere,
 * mas quem decide qual produto atende ao item é a pessoa. Enquanto ela não
 * escolhe, o item não entra na lista de compras.
 */

import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Checkbox, Chip, ErrorNotice } from '../components';
import { PlanoPrescrito } from '../components/PlanoPrescrito';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PlanItem } from '../types/api';
import {
  useConfirmationViewModel,
  usePlanItemViewModel,
} from '../viewmodels/useConfirmationViewModel';

export default function ConfirmationScreen({
  planId,
  onReady,
  onNewPlan,
}: {
  planId: string;
  onReady: (planId: string) => void;
  /** Volta ao envio de PDF. Esta tela é a casa da aba Dieta desde que o plano
   * passou a ser reencontrado na partida, então precisa ter porta de saída. */
  onNewPlan: () => void;
}) {
  const vm = useConfirmationViewModel(planId);

  if (vm.carregando) return <Body muted>Carregando o plano…</Body>;

  if (vm.erro) {
    return (
      <View style={styles.conteudo}>
        <ErrorNotice message={vm.erro} />
      </View>
    );
  }

  const { itens, confirmados } = vm;

  return (
    <FlatList
      data={itens}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.conteudo}
      ListHeaderComponent={
        <View style={styles.cabecalho}>
          <Text style={styles.titulo}>Confirme os produtos</Text>
          <Body muted>
            Escolhemos candidatos por semelhança de nome. Confirme cada item, ou marque
            vários e confirme de uma vez: só o que você confirmar entra na lista de
            compras.
          </Body>
          <Chip
            label={`${confirmados} de ${itens.length} confirmados`}
            tone={confirmados === itens.length ? 'success' : 'neutral'}
          />
          {vm.temPlanoNovo ? (
            <Card style={styles.planoNovo}>
              <Body>Sua nutricionista enviou um plano novo.</Body>
              <Button label="Ver plano novo" variant="secondary" onPress={onNewPlan} />
            </Card>
          ) : null}
          {vm.refeicoes ? (
            <Card style={styles.planoNovo}>
              <Pressable accessibilityRole="button" onPress={vm.alternarPlano}>
                <Text style={styles.verPlano}>
                  {vm.planoAberto
                    ? 'Ocultar refeições e substituições'
                    : 'Ver refeições e substituições'}
                </Text>
              </Pressable>
              {vm.planoAberto ? (
                <PlanoPrescrito
                  meals={vm.refeicoes.meals}
                  notes={vm.refeicoes.notes}
                />
              ) : null}
            </Card>
          ) : null}
          {vm.tamanhoDoLote > 0 ? (
            <View style={styles.lote}>
              <Pressable
                accessibilityRole="none"
                onPress={vm.alternarTodos}
                style={styles.selecionarTodos}
              >
                <Checkbox
                  label="Selecionar sugeridos"
                  checked={vm.todosMarcados}
                  onPress={vm.alternarTodos}
                />
                {/* O "de N" mostra que o lote é parte da lista de propósito: com
                    "Selecionar todos (1)" num plano de 50 itens, parecia defeito. */}
                <Text style={styles.selecionarTodosTexto}>
                  Selecionar sugeridos ({vm.tamanhoDoLote} de {vm.pendentes})
                </Text>
              </Pressable>
              <Button
                label={`Confirmar selecionados (${vm.selecionados})`}
                onPress={vm.confirmarSelecionados}
                disabled={vm.selecionados === 0}
                loading={vm.confirmandoLote}
              />
              {vm.pendentes > vm.tamanhoDoLote ? (
                <Body muted>
                  Itens não encontrados, com unidade diferente ou sem sugestão ficam fora
                  do lote: confirme esses um a um.
                </Body>
              ) : null}
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <ItemDoPlano
          planId={planId}
          item={item}
          noLote={vm.noLote(item.id)}
          marcado={vm.marcado(item.id)}
          onAlternar={() => vm.alternar(item.id)}
          falhouNoLote={vm.falhouNoLote(item.id)}
        />
      )}
      extraData={vm.extraData}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListFooterComponent={
        <View style={styles.rodape}>
          {/* A lista é gerada na aba Mercado, depois de escolher a região. Este
              botão leva até lá, e chamá-lo de "gerar" prometia o que ele não faz
              — havia dois botões com esse mesmo nome, em telas diferentes. */}
          <Button
            label="Ir para o mercado"
            onPress={() => onReady(planId)}
            disabled={confirmados === 0}
          />
          {confirmados === 0 ? (
            <Body muted>Confirme ao menos um item para gerar a lista.</Body>
          ) : null}
          <Button label="Enviar outro plano" variant="ghost" onPress={onNewPlan} />
        </View>
      }
    />
  );
}

function ItemDoPlano({
  planId,
  item,
  noLote,
  marcado,
  onAlternar,
  falhouNoLote,
}: {
  planId: string;
  item: PlanItem;
  /** O item pode ser marcado para a confirmação em lote. */
  noLote: boolean;
  marcado: boolean;
  onAlternar: () => void;
  falhouNoLote: boolean;
}) {
  const {
    aberto,
    confirmado,
    sugestao,
    candidatos,
    buscando,
    buscaFalhou,
    confirmando,
    confirmacaoFalhou,
    alternarAberto,
    confirmar,
  } = usePlanItemViewModel(planId, item);

  return (
    <Card>
      <View style={styles.linhaItem}>
        {noLote ? (
          <Checkbox
            label={`Selecionar ${item.raw_description}`}
            checked={marcado}
            onPress={onAlternar}
          />
        ) : null}
        <View style={styles.descricao}>
          <Text style={styles.itemTexto}>{item.raw_description}</Text>
          <Text style={styles.itemQuantidade}>
            {item.quantity} {item.unit}
          </Text>
          {/* O texto acima é o da prescrição e não muda; o que muda ao editar é
              o produto. Sem esta linha, trocar por outro não aparecia em lugar
              nenhum do card. */}
          {confirmado && item.product !== null ? (
            <Text style={styles.produtoEscolhido}>
              → {item.product.name}
              {item.product.brand ? ` · ${item.product.brand}` : ''}
            </Text>
          ) : null}
        </View>
        <Chip
          label={
            confirmado
              ? 'confirmado'
              : item.status === 'nao_identificado'
                ? 'não encontrado'
                : 'a confirmar'
          }
          tone={confirmado ? 'success' : item.status === 'nao_identificado' ? 'danger' : 'warning'}
        />
      </View>

      {!confirmado && sugestao !== null && !aberto ? (
        <View style={styles.sugestao}>
          <View style={styles.candidatoTexto}>
            <Text style={styles.candidatoNome}>{sugestao.product.name}</Text>
            <Text style={styles.candidatoDetalhe}>
              {sugestao.product.brand ?? 'sem marca'} ·{' '}
              {Math.round(Number(sugestao.score) * 100)}% de semelhança
            </Text>
          </View>
          {!sugestao.unit_compatible ? <Chip label="unidade diferente" tone="danger" /> : null}
        </View>
      ) : null}

      {!confirmado ? (
        <View style={styles.acoes}>
          {sugestao !== null && !aberto ? (
            <Button
              label="Confirmar"
              onPress={() => confirmar(sugestao)}
              loading={confirmando}
            />
          ) : null}
          <Button
            label={aberto ? 'Fechar opções' : 'Ver outras opções'}
            variant="ghost"
            onPress={alternarAberto}
          />
        </View>
      ) : null}

      {!confirmado && buscando ? (
        <Body muted>Procurando o produto no catálogo…</Body>
      ) : null}

      {!confirmado && !buscando && sugestao === null && !aberto ? (
        <Body muted>Nenhum produto do catálogo se parece com este item.</Body>
      ) : null}

      {!confirmado && (confirmacaoFalhou || falhouNoLote) && !aberto ? (
        <ErrorNotice message="não foi possível confirmar este produto" />
      ) : null}

      {confirmado ? (
        <Button
          label={aberto ? 'Cancelar edição' : 'Editar'}
          variant="ghost"
          onPress={alternarAberto}
        />
      ) : null}

      {aberto ? (
        <View style={styles.candidatos}>
          {buscando ? <Body muted>Buscando no catálogo…</Body> : null}

          {buscaFalhou ? (
            <ErrorNotice message="não foi possível buscar os candidatos" />
          ) : null}

          {candidatos?.length === 0 ? (
            <Body muted>Nenhum produto do catálogo se parece com este item.</Body>
          ) : null}

          {candidatos?.map((candidato) => (
            <Pressable
              key={candidato.product.id}
              accessibilityRole="button"
              onPress={() => confirmar(candidato)}
              style={styles.candidato}
            >
              <View style={styles.candidatoTexto}>
                <Text style={styles.candidatoNome}>{candidato.product.name}</Text>
                <Text style={styles.candidatoDetalhe}>
                  {candidato.product.brand ?? 'sem marca'} ·{' '}
                  {Math.round(Number(candidato.score) * 100)}% de semelhança
                </Text>
              </View>
              {candidato.product.id === item.product_id ? (
                <Chip label="atual" tone="success" />
              ) : null}
              {!candidato.unit_compatible ? <Chip label="unidade diferente" tone="danger" /> : null}
            </Pressable>
          ))}

          {confirmacaoFalhou ? (
            <ErrorNotice message="não foi possível confirmar este produto" />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  planoNovo: { gap: spacing.sm },
  verPlano: { ...typography.labelLg, color: colors.primary },
  conteudo: { padding: spacing.margin, gap: spacing.sm, paddingBottom: spacing.xl3 },
  cabecalho: { gap: spacing.xs, marginBottom: spacing.sm },
  titulo: { ...typography.headlineLg, color: colors.primary },
  lote: { gap: spacing.xs, marginTop: spacing.xs },
  selecionarTodos: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selecionarTodosTexto: { ...typography.labelLg, color: colors.onSurface },

  linhaItem: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  descricao: { flex: 1, gap: 2 },
  itemTexto: { ...typography.bodyMd, color: colors.onSurface },
  itemQuantidade: { ...typography.labelSm, color: colors.onSurfaceVariant },
  produtoEscolhido: { ...typography.labelLg, color: colors.primary },

  sugestao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  acoes: { gap: spacing.xs2 },
  candidatos: { gap: spacing.xs, marginTop: spacing.xs },
  candidato: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  candidatoTexto: { flex: 1 },
  candidatoNome: { ...typography.labelLg, color: colors.onSurface },
  candidatoDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },

  rodape: { gap: spacing.xs, marginTop: spacing.lg },
});
