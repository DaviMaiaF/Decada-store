/**
 * Lista de compras, agrupada pelos corredores do mercado.
 *
 * O agrupamento acontece aqui, e não no servidor: a API devolve os itens em
 * lista plana com a categoria dentro do produto, e como exibir é decisão de
 * quem exibe.
 *
 * Todo preço aparece com data e origem. Preço com mais de 30 dias é mostrado
 * como estimativa — é a decisão nº 1 do projeto, e a tela é o último lugar
 * onde ela pode se perder.
 */

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import { ApiError, generateShoppingList, readShoppingList } from '../services/api';
import { describeConfidence, describeOrigin, formatMoney, formatQuantity } from '../services/format';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ShoppingList, ShoppingListItem } from '../types/api';

/** Rótulo de cada corredor. As chaves são as categorias do catálogo. */
const CORREDORES: Record<string, string> = {
  hortifruti: 'Hortifrúti',
  proteinas: 'Carnes & Ovos',
  laticinios: 'Laticínios',
  mercearia: 'Mercearia & Grãos',
};

export default function MarketScreen({
  planId,
  listId,
  onGenerated,
}: {
  planId: string | null;
  listId: string | null;
  onGenerated: (listId: string) => void;
}) {
  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  const geracao = useMutation({
    mutationFn: () => generateShoppingList(planId!, 'DF', 'Brasília'),
    onSuccess: (resultado) => onGenerated(resultado.shopping_list.id),
  });

  if (listId === null) {
    return (
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Lista de Mercado</Text>
        {planId === null ? (
          <Body muted>
            Envie o plano da sua nutricionista na aba Dieta para gerar sua lista.
          </Body>
        ) : (
          <>
            <Body muted>
              Gere a lista com os itens que você confirmou. O que já estiver na sua
              despensa é descontado automaticamente.
            </Body>
            {geracao.isError ? (
              <ErrorNotice
                message={
                  geracao.error instanceof ApiError
                    ? geracao.error.message
                    : 'não foi possível gerar a lista'
                }
              />
            ) : null}
            <Button
              label="Gerar lista de compras"
              onPress={() => geracao.mutate()}
              loading={geracao.isPending}
            />
          </>
        )}
      </ScrollView>
    );
  }

  if (lista.isPending) return <Body muted>Carregando a lista…</Body>;

  if (lista.isError) {
    return (
      <View style={styles.conteudo}>
        <ErrorNotice message="não foi possível carregar a lista" />
      </View>
    );
  }

  return <ListaCarregada lista={lista.data} />;
}

function ListaCarregada({ lista }: { lista: ShoppingList }) {
  const [comprados, setComprados] = useState<Set<string>>(new Set());

  const porCorredor = useMemo(() => {
    const grupos = new Map<string, ShoppingListItem[]>();
    for (const item of lista.items) {
      const chave = item.product.category ?? 'outros';
      grupos.set(chave, [...(grupos.get(chave) ?? []), item]);
    }
    return [...grupos.entries()];
  }, [lista.items]);

  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const dispensados = lista.items.filter((item) => item.dispensed_by_pantry);
  const progresso = aComprar.length === 0 ? 0 : (comprados.size / aComprar.length) * 100;

  function alternar(id: string) {
    setComprados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Lista de Mercado</Text>

      <Card style={styles.resumo}>
        <Text style={styles.resumoRotulo}>ESTIMATIVA DA COMPRA</Text>
        <Text style={styles.total}>{formatMoney(lista.estimated_total)}</Text>
        <Text style={styles.resumoRegiao}>
          {lista.city} · {lista.state_code}
        </Text>
        <View style={styles.progresso}>
          <ProgressBar percent={progresso} />
          <Text style={styles.progressoTexto}>
            {comprados.size} de {aComprar.length} itens comprados
          </Text>
        </View>
      </Card>

      {dispensados.length > 0 ? (
        <Card style={styles.sincronizacao}>
          <SectionTitle>Sincronização com a despensa</SectionTitle>
          <Body muted>
            {dispensados.length} item(ns) saíram da compra porque você já tem em casa.
          </Body>
        </Card>
      ) : null}

      {porCorredor.map(([categoria, itens]) => (
        <View key={categoria} style={styles.corredor}>
          <SectionTitle>{CORREDORES[categoria] ?? 'Outros'}</SectionTitle>
          {itens.map((item) => (
            <ItemDaLista
              key={item.id}
              item={item}
              comprado={comprados.has(item.id)}
              onToggle={() => alternar(item.id)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function ItemDaLista({
  item,
  comprado,
  onToggle,
}: {
  item: ShoppingListItem;
  comprado: boolean;
  onToggle: () => void;
}) {
  const dispensado = item.dispensed_by_pantry;

  return (
    <Card style={[styles.item, comprado && styles.itemComprado]}>
      <View style={styles.itemTopo}>
        <View style={styles.itemTexto}>
          <Text style={[styles.itemNome, comprado && styles.riscado]}>{item.product.name}</Text>
          <Text style={styles.itemQuantidade}>
            {dispensado
              ? `${formatQuantity(item.quantity_from_pantry, item.unit)} já em casa`
              : formatQuantity(item.quantity, item.unit)}
            {item.packages_needed ? ` · ${item.packages_needed} embalagem(ns)` : ''}
          </Text>
        </View>
        <Text style={styles.itemPreco}>{formatMoney(item.estimated_cost)}</Text>
      </View>

      {/* Preço nunca anda sozinho: data, origem e tamanho da amostra junto. */}
      <Text style={styles.procedencia}>
        {describeConfidence(item.price_confidence, item.price_reference_date)}
        {item.price_origin ? ` · ${describeOrigin(item.price_origin)}` : ''}
        {item.price_sample_size ? ` · ${item.price_sample_size} coleta(s)` : ''}
      </Text>

      {item.product.is_fictitious ? (
        <Chip label="dado fictício de desenvolvimento" tone="warning" />
      ) : null}

      {Number(item.quantity_from_pantry) > 0 && !dispensado ? (
        <Chip
          label={`${formatQuantity(item.quantity_from_pantry, item.unit)} vieram da despensa`}
          tone="success"
        />
      ) : null}

      {dispensado ? (
        <Chip label="não precisa comprar" tone="success" />
      ) : (
        <Button
          label={comprado ? 'Desmarcar' : 'Já comprei'}
          variant="ghost"
          onPress={onToggle}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  titulo: { ...typography.headlineLg, color: colors.primary },

  resumo: { backgroundColor: colors.primaryContainer, gap: spacing.xs2 },
  resumoRotulo: { ...typography.labelSm, color: colors.onPrimaryContainer },
  total: { ...typography.currency, color: colors.onPrimary },
  resumoRegiao: { ...typography.bodySm, color: colors.onPrimaryContainer },
  progresso: { gap: spacing.xs2, marginTop: spacing.xs },
  progressoTexto: { ...typography.labelSm, color: colors.onPrimaryContainer },

  sincronizacao: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },

  corredor: { gap: spacing.xs },
  item: { gap: spacing.xs2 },
  itemComprado: { opacity: 0.5 },
  itemTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  itemTexto: { flex: 1 },
  itemNome: { ...typography.labelLg, color: colors.onSurface },
  riscado: { textDecorationLine: 'line-through' },
  itemQuantidade: { ...typography.labelSm, color: colors.onSurfaceVariant },
  itemPreco: { ...typography.labelLg, color: colors.primary },
  procedencia: { ...typography.labelSm, color: colors.onSurfaceVariant },
});
