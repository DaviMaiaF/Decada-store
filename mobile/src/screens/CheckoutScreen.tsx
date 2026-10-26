/**
 * Finalização da compra — **simulada**.
 *
 * O MVP não fala com mercado nenhum: não há pedido nem entrega, e o pagamento
 * imita o Mercado Pago sem cobrar nada. Esta tela fecha o fluxo para quem
 * chegou à estimativa e quer "comprar", e diz com todas as letras que é uma
 * simulação, com valores estimados ou fictícios.
 *
 * Duas etapas: o resumo e o pagamento (Pix ou cartão). Aprovado o pagamento,
 * os itens que faltavam são marcados como comprados: a pessoa finalizou a
 * compra com o que escolheu, e deixar a trilha em "9/16" depois disso dizia que
 * ela ainda estava no corredor. Tudo isso mora no `useCheckoutViewModel`.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from '../components';
import { AnimacaoDeSucesso } from '../components/AnimacaoDeSucesso';
import { ListaDesatualizada } from '../components/ListaDesatualizada';
import { PagamentoSimulado } from '../components/PagamentoSimulado';
import { formatMoney, formatQuantity } from '../services/format';
import { colors, spacing, typography } from '../theme/tokens';
import type { ShoppingList } from '../types/api';
import { useCheckoutViewModel } from '../viewmodels/useCheckoutViewModel';

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
  const {
    etapa,
    irParaPagamento,
    voltarAoResumo,
    pagamento,
    concluido,
    aComprar,
    semPreco,
    temFicticio,
    confirmar,
    confirmando,
    falhou,
  } = useCheckoutViewModel(lista);

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

  if (etapa === 'pagamento') {
    return (
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={styles.titulo}>Pagamento</Text>

        <Card style={styles.aviso}>
          <Chip label="simulação" tone="warning" />
          <Body>{AVISO_SIMULACAO}</Body>
        </Card>

        {pagamento.pago ? (
          // Lista paga numa visita anterior, ou marcação dos itens que falhou
          // depois da aprovação: o que falta é só concluir.
          <>
            <Card style={styles.pago}>
              <Chip label="pago" tone="success" />
              <Body>O pagamento desta lista já foi aprovado.</Body>
            </Card>
            {falhou ? (
              <ErrorNotice message="não foi possível concluir a compra; tente de novo" />
            ) : null}
            <Button label="Concluir compra" onPress={confirmar} loading={confirmando} />
          </>
        ) : (
          <PagamentoSimulado vm={pagamento} />
        )}

        <Button label="Voltar ao resumo" variant="ghost" onPress={voltarAoResumo} />
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

      <View style={styles.acoes}>
        <Button
          label="Ir para o pagamento"
          onPress={irParaPagamento}
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
  pago: { backgroundColor: colors.primaryFixed, gap: spacing.xs2 },
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
