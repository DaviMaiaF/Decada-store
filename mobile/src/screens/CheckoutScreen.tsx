/**
 * Finalização da compra — **simulada**.
 *
 * O MVP não fala com mercado nenhum: não há pedido, entrega nem pagamento. Esta
 * tela fecha o fluxo para quem chegou à estimativa e quer "comprar", e diz com
 * todas as letras que é uma simulação, com valores estimados ou fictícios.
 *
 * Confirmar marca como comprados os itens que faltavam: a pessoa finalizou a
 * compra com o que escolheu, e deixar a trilha em "9/16" depois disso dizia que
 * ela ainda estava no corredor. Nenhum pedido sai daqui — a única chamada à
 * API é a mesma do "Já comprei", item a item.
 */

import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from '../components';
import { AnimacaoDeSucesso } from '../components/AnimacaoDeSucesso';
import { ListaDesatualizada } from '../components/ListaDesatualizada';
import { setItemPurchased } from '../services/api';
import { formatMoney, formatQuantity } from '../services/format';
import { colors, spacing, typography } from '../theme/tokens';
import type { ShoppingList } from '../types/api';

export const AVISO_SIMULACAO =
  'Compra simulada: os valores são estimativas ou dados fictícios, nenhum pedido é feito e nada é cobrado.';

export default function CheckoutScreen({
  lista,
  onVoltar,
  onGenerated,
  onIrAoInicio,
}: {
  lista: ShoppingList;
  onVoltar: () => void;
  /** Lista nova, gerada pelo aviso de plano alterado. */
  onGenerated: (listId: string) => void;
  /** Fecha a compra concluída e leva ao início. */
  onIrAoInicio: () => void;
}) {
  const cliente = useQueryClient();
  const [concluido, setConcluido] = useState(false);

  // Mesmo recorte da lista: o que a despensa dispensou não entra na compra.
  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const semPreco = aComprar.filter((item) => item.estimated_cost === null).length;
  const temFicticio = aComprar.some((item) => item.product.is_fictitious);

  // Só o que ainda não foi marcado: quem já riscou metade no corredor não
  // precisa de uma chamada repetida para cada item que já estava certo.
  const confirmacao = useMutation({
    mutationFn: () =>
      Promise.all(
        aComprar
          .filter((item) => !item.purchased)
          .map((item) => setItemPurchased(lista.id, item.id, true)),
      ),
    onSuccess: () => setConcluido(true),
    // Mesmo com falha parcial, alguns itens podem ter sido gravados: a lista
    // é lida de novo nos dois casos, e a trilha acompanha.
    onSettled: () => cliente.invalidateQueries({ queryKey: ['shopping-list', lista.id] }),
  });

  if (concluido) {
    return (
      <ScrollView contentContainerStyle={[styles.conteudo, styles.conclusao]}>
        <View style={styles.icone}>
          <AnimacaoDeSucesso />
        </View>
        <Text style={[styles.titulo, styles.centro]}>Compra concluída</Text>
        <Body muted>
          {aComprar.length} item(ns) marcados como comprados, por cerca de{' '}
          {formatMoney(lista.estimated_total)} em {lista.city} · {lista.state_code}.
        </Body>
        <Card style={styles.aviso}>
          <Body>{AVISO_SIMULACAO}</Body>
        </Card>
        <Button label="Ir para o início" onPress={onIrAoInicio} />
        <Button label="Ver a lista" variant="ghost" onPress={onVoltar} />
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

      {/* O checkout lê a mesma lista: sem isto, finalizaria com o produto
          antigo quem trocou o item na Dieta depois de gerar. */}
      <ListaDesatualizada lista={lista} onGenerated={onGenerated} />

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

      {confirmacao.isError ? (
        <ErrorNotice message="não foi possível concluir a compra; tente de novo" />
      ) : null}

      <View style={styles.acoes}>
        <Button
          label="Confirmar compra simulada"
          onPress={() => confirmacao.mutate()}
          loading={confirmacao.isPending}
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
  conclusao: { paddingTop: spacing.xl3 },
  icone: { alignSelf: 'center' },
  centro: { textAlign: 'center' },
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
