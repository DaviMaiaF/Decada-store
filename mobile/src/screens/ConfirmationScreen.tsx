/**
 * Confirmação do casamento item–produto.
 *
 * É a tela onde a regra mais importante do projeto aparece: o servidor sugere,
 * mas quem decide qual produto atende ao item é a pessoa. Enquanto ela não
 * escolhe, o item não entra na lista de compras.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { Body, Button, Card, Checkbox, Chip, ErrorNotice } from '../components';
import { ApiError, confirmItem, readCandidates, readMealPlan } from '../services/api';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { Candidate, PlanItem } from '../types/api';

/**
 * Só entra no lote o item cuja sugestão dá para aceitar de olhos fechados: o
 * import o deixou "a confirmar" (sugestão acima do score mínimo), e ela mede na
 * mesma unidade da prescrição. Item "não encontrado" também tem candidatos, só
 * que fracos — no lote, viravam "Tapioca → Filé de tilápia" num toque só.
 * Esses, os de unidade diferente e os sem sugestão pedem o toque individual.
 */
function entraNoLote(item: PlanItem, sugestao: Candidate | null): sugestao is Candidate {
  return item.status === 'pendente' && sugestao !== null && sugestao.unit_compatible;
}

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
  const cliente = useQueryClient();
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId),
  });

  const itens = plano.data?.items ?? [];
  const pendentes = itens.filter((item) => item.status !== 'confirmado');

  // Mesma chave que cada item usa: o React Query faz uma busca só, e a tela
  // fica sabendo da sugestão de todos para montar o lote.
  const buscas = useQueries({
    queries: pendentes.map((item) => ({
      queryKey: ['candidates', planId, item.id],
      queryFn: () => readCandidates(planId, item.id),
    })),
  });

  const sugestoes = new Map<string, Candidate>();
  pendentes.forEach((item, indice) => {
    const sugestao = buscas[indice]?.data?.[0] ?? null;
    if (entraNoLote(item, sugestao)) sugestoes.set(item.id, sugestao);
  });

  const [marcados, setMarcados] = useState<ReadonlySet<string>>(new Set());
  const [falhasDoLote, setFalhasDoLote] = useState<ReadonlySet<string>>(new Set());

  // Item que saiu do lote (confirmado, ou cuja sugestão mudou) deixa de contar
  // mesmo que a marca tenha ficado no estado.
  const selecionados = [...marcados].filter((id) => sugestoes.has(id));
  const todosMarcados = sugestoes.size > 0 && selecionados.length === sugestoes.size;

  const lote = useMutation({
    mutationFn: async (ids: string[]) => {
      // Uma chamada por item, e uma falha não derruba as outras: quem confirmou
      // dez de doze não precisa refazer as dez.
      const resultados = await Promise.allSettled(
        ids.map((id) => {
          const sugestao = sugestoes.get(id)!;
          return confirmItem(planId, id, sugestao.product.id, sugestao.score);
        }),
      );
      return ids.filter((_, indice) => resultados[indice].status === 'rejected');
    },
    onSuccess: (falhas) => {
      setFalhasDoLote(new Set(falhas));
      setMarcados(new Set(falhas));
    },
    onSettled: () => {
      cliente.invalidateQueries({ queryKey: ['meal-plan', planId] });
      // A lista já gerada não muda, mas passa a dizer que ficou para trás.
      cliente.invalidateQueries({ queryKey: ['shopping-list'] });
    },
  });

  function alternar(id: string) {
    setMarcados((antes) => {
      const depois = new Set(antes);
      if (depois.has(id)) depois.delete(id);
      else depois.add(id);
      return depois;
    });
  }

  function alternarTodos() {
    setMarcados(todosMarcados ? new Set() : new Set(sugestoes.keys()));
  }

  if (plano.isPending) return <Body muted>Carregando o plano…</Body>;

  if (plano.isError) {
    return (
      <View style={styles.conteudo}>
        <ErrorNotice
          message={
            plano.error instanceof ApiError
              ? plano.error.message
              : 'não foi possível carregar o plano'
          }
        />
      </View>
    );
  }

  const confirmados = itens.filter((item) => item.status === 'confirmado').length;

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
          {sugestoes.size > 0 ? (
            <View style={styles.lote}>
              <Pressable
                accessibilityRole="none"
                onPress={alternarTodos}
                style={styles.selecionarTodos}
              >
                <Checkbox
                  label="Selecionar sugeridos"
                  checked={todosMarcados}
                  onPress={alternarTodos}
                />
                {/* O "de N" mostra que o lote é parte da lista de propósito: com
                    "Selecionar todos (1)" num plano de 50 itens, parecia defeito. */}
                <Text style={styles.selecionarTodosTexto}>
                  Selecionar sugeridos ({sugestoes.size} de {pendentes.length})
                </Text>
              </Pressable>
              <Button
                label={`Confirmar selecionados (${selecionados.length})`}
                onPress={() => lote.mutate(selecionados)}
                disabled={selecionados.length === 0}
                loading={lote.isPending}
              />
              {pendentes.length > sugestoes.size ? (
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
          noLote={sugestoes.has(item.id)}
          marcado={marcados.has(item.id)}
          onAlternar={() => alternar(item.id)}
          falhouNoLote={falhasDoLote.has(item.id)}
        />
      )}
      extraData={[marcados, falhasDoLote, sugestoes.size]}
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
  // Em item pendente, abre as outras opções; em item confirmado, é a edição.
  const [aberto, setAberto] = useState(false);
  const cliente = useQueryClient();

  const confirmado = item.status === 'confirmado';

  // Busca assim que o item aparece, e não só quando a pessoa abre. São 120
  // produtos comparados por item, o que parecia caro — medido, dá 15 ms por
  // item, e o custo real era outro: confirmar um plano de 15 itens pedia três
  // toques em cada um. Item já confirmado só busca quando a pessoa pede para
  // editar.
  const candidatos = useQuery({
    queryKey: ['candidates', planId, item.id],
    queryFn: () => readCandidates(planId, item.id),
    enabled: !confirmado || aberto,
  });

  const sugestao = candidatos.data?.[0] ?? null;

  const confirmacao = useMutation({
    mutationFn: ({ productId, score }: { productId: string; score: string | null }) =>
      confirmItem(planId, item.id, productId, score),
    onSuccess: () => {
      setAberto(false);
      cliente.invalidateQueries({ queryKey: ['meal-plan', planId] });
      // A lista já gerada não muda, mas passa a dizer que ficou para trás.
      cliente.invalidateQueries({ queryKey: ['shopping-list'] });
    },
  });

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
              onPress={() =>
                confirmacao.mutate({
                  productId: sugestao.product.id,
                  score: sugestao.score,
                })
              }
              loading={confirmacao.isPending}
            />
          ) : null}
          <Button
            label={aberto ? 'Fechar opções' : 'Ver outras opções'}
            variant="ghost"
            onPress={() => setAberto((estava) => !estava)}
          />
        </View>
      ) : null}

      {!confirmado && candidatos.isPending ? (
        <Body muted>Procurando o produto no catálogo…</Body>
      ) : null}

      {!confirmado && !candidatos.isPending && sugestao === null && !aberto ? (
        <Body muted>Nenhum produto do catálogo se parece com este item.</Body>
      ) : null}

      {!confirmado && (confirmacao.isError || falhouNoLote) && !aberto ? (
        <ErrorNotice message="não foi possível confirmar este produto" />
      ) : null}

      {confirmado ? (
        <Button
          label={aberto ? 'Cancelar edição' : 'Editar'}
          variant="ghost"
          onPress={() => setAberto((estava) => !estava)}
        />
      ) : null}

      {aberto ? (
        <View style={styles.candidatos}>
          {candidatos.isPending ? <Body muted>Buscando no catálogo…</Body> : null}

          {candidatos.isError ? (
            <ErrorNotice message="não foi possível buscar os candidatos" />
          ) : null}

          {candidatos.data?.length === 0 ? (
            <Body muted>Nenhum produto do catálogo se parece com este item.</Body>
          ) : null}

          {candidatos.data?.map((candidato) => (
            <Pressable
              key={candidato.product.id}
              accessibilityRole="button"
              onPress={() =>
                confirmacao.mutate({
                  productId: candidato.product.id,
                  score: candidato.score,
                })
              }
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

          {confirmacao.isError ? (
            <ErrorNotice message="não foi possível confirmar este produto" />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
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
