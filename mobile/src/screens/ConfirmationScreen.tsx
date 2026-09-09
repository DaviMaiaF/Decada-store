/**
 * Confirmação do casamento item–produto.
 *
 * É a tela onde a regra mais importante do projeto aparece: o servidor sugere,
 * mas quem decide qual produto atende ao item é a pessoa. Enquanto ela não
 * escolhe, o item não entra na lista de compras.
 */

import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from '../components';
import { ApiError, confirmItem, readCandidates, readMealPlan } from '../services/api';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PlanItem } from '../types/api';

export default function ConfirmationScreen({
  planId,
  onReady,
}: {
  planId: string;
  onReady: (planId: string) => void;
}) {
  const plano = useQuery({
    queryKey: ['meal-plan', planId],
    queryFn: () => readMealPlan(planId),
  });

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

  const itens = plano.data.items;
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
            Escolhemos candidatos por semelhança de nome. Confirme cada item: só o que
            você confirmar entra na lista de compras.
          </Body>
          <Chip
            label={`${confirmados} de ${itens.length} confirmados`}
            tone={confirmados === itens.length ? 'success' : 'neutral'}
          />
        </View>
      }
      renderItem={({ item }) => <ItemDoPlano planId={planId} item={item} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListFooterComponent={
        <View style={styles.rodape}>
          <Button
            label="Gerar lista de compras"
            onPress={() => onReady(planId)}
            disabled={confirmados === 0}
          />
          {confirmados === 0 ? (
            <Body muted>Confirme ao menos um item para gerar a lista.</Body>
          ) : null}
        </View>
      }
    />
  );
}

function ItemDoPlano({ planId, item }: { planId: string; item: PlanItem }) {
  const [aberto, setAberto] = useState(false);
  const cliente = useQueryClient();

  const candidatos = useQuery({
    queryKey: ['candidates', planId, item.id],
    queryFn: () => readCandidates(planId, item.id),
    // Só busca quando a pessoa abre: são 120 produtos comparados por item.
    enabled: aberto,
  });

  const confirmacao = useMutation({
    mutationFn: ({ productId, score }: { productId: string; score: string | null }) =>
      confirmItem(planId, item.id, productId, score),
    onSuccess: () => {
      setAberto(false);
      cliente.invalidateQueries({ queryKey: ['meal-plan', planId] });
    },
  });

  const confirmado = item.status === 'confirmado';

  return (
    <Card>
      <View style={styles.linhaItem}>
        <View style={styles.descricao}>
          <Text style={styles.itemTexto}>{item.raw_description}</Text>
          <Text style={styles.itemQuantidade}>
            {item.quantity} {item.unit}
          </Text>
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

      {!confirmado ? (
        <Button
          label={aberto ? 'Fechar sugestões' : 'Ver sugestões'}
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

  linhaItem: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  descricao: { flex: 1, gap: 2 },
  itemTexto: { ...typography.bodyMd, color: colors.onSurface },
  itemQuantidade: { ...typography.labelSm, color: colors.onSurfaceVariant },

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
