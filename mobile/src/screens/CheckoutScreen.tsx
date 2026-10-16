/**
 * Finalização da compra — **simulada**.
 *
 * O MVP não fala com mercado nenhum: não há pedido, entrega nem pagamento. Esta
 * tela fecha o fluxo para quem chegou à estimativa e quer "comprar", e diz com
 * todas as letras que é uma simulação, com valores estimados ou fictícios.
 *
 * Nada aqui chama a API. Confirmar não marca item como comprado: "comprado" é
 * o que a pessoa pegou na prateleira, e misturar com um pedido de mentira
 * estragaria o progresso real da compra.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, SectionTitle } from '../components';
import { formatMoney, formatQuantity } from '../services/format';
import { colors, spacing, typography } from '../theme/tokens';
import type { ShoppingList } from '../types/api';

export const AVISO_SIMULACAO =
  'Compra simulada: os valores são estimativas ou dados fictícios, nenhum pedido é feito e nada é cobrado.';

export default function CheckoutScreen({
  lista,
  onVoltar,
}: {
  lista: ShoppingList;
  onVoltar: () => void;
}) {
  const [concluido, setConcluido] = useState(false);

  // Mesmo recorte da lista: o que a despensa dispensou não entra na compra.
  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const semPreco = aComprar.filter((item) => item.estimated_cost === null).length;
  const temFicticio = aComprar.some((item) => item.product.is_fictitious);

  if (concluido) {
    return (
      <ScrollView contentContainerStyle={styles.conteudo}>
        <Text style={styles.titulo}>Compra simulada concluída</Text>
        <Card style={styles.aviso}>
          <Body>{AVISO_SIMULACAO}</Body>
        </Card>
        <Body muted>
          Se fosse de verdade, seriam {aComprar.length} item(ns) por cerca de{' '}
          {formatMoney(lista.estimated_total)} em {lista.city} · {lista.state_code}. Sua
          lista continua como estava.
        </Body>
        <Button label="Voltar à lista" onPress={onVoltar} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Finalizar compra</Text>

      <Card style={styles.aviso}>
        <Chip label="simulação" tone="warning" />
        <Body>{AVISO_SIMULACAO}</Body>
      </Card>

      <Card style={styles.resumo}>
        <Text style={styles.resumoRotulo}>TOTAL ESTIMADO</Text>
        <Text style={styles.total}>{formatMoney(lista.estimated_total)}</Text>
        <Text style={styles.resumoRegiao}>
          {lista.city} · {lista.state_code}
        </Text>
      </Card>

      {semPreco > 0 ? (
        <Body muted>
          {semPreco} item(ns) sem preço coletado nesta região não entram no total.
        </Body>
      ) : null}
      {temFicticio ? (
        <Chip label="inclui dado fictício de desenvolvimento" tone="warning" />
      ) : null}

      <SectionTitle>Itens ({aComprar.length})</SectionTitle>
      {aComprar.map((item) => (
        <View key={item.id} style={styles.linha}>
          <View style={styles.linhaTexto}>
            <Text style={styles.nome}>{item.product.name}</Text>
            <Text style={styles.detalhe}>{formatQuantity(item.quantity, item.unit)}</Text>
          </View>
          <Text style={styles.preco}>{formatMoney(item.estimated_cost)}</Text>
        </View>
      ))}

      <View style={styles.acoes}>
        <Button
          label="Confirmar compra simulada"
          onPress={() => setConcluido(true)}
          disabled={aComprar.length === 0}
        />
        <Button label="Voltar à lista" variant="ghost" onPress={onVoltar} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  conteudo: { padding: spacing.margin, gap: spacing.md, paddingBottom: spacing.xl3 },
  titulo: { ...typography.headlineLg, color: colors.primary },
  aviso: { backgroundColor: colors.surfaceContainerLow, gap: spacing.xs2 },
  resumo: { backgroundColor: colors.primaryContainer, gap: spacing.xs2 },
  resumoRotulo: { ...typography.labelSm, color: colors.onPrimaryContainer },
  total: { ...typography.currency, color: colors.onPrimary },
  resumoRegiao: { ...typography.bodySm, color: colors.onPrimaryContainer },
  linha: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  linhaTexto: { flex: 1 },
  nome: { ...typography.labelLg, color: colors.onSurface },
  detalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  preco: { ...typography.labelLg, color: colors.onSurface },
  acoes: { gap: spacing.xs, marginTop: spacing.md },
});
