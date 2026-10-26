/**
 * Etapa de pagamento do checkout — **simulada**, no molde do Mercado Pago.
 *
 * Só desenha e repassa toques: o estado e as chamadas moram no
 * `usePaymentViewModel`, que chega pronto por `vm`.
 *
 * O QR é desenhado a partir do copia-e-cola fictício. Ele aponta para uma
 * chave que não existe (`simulado@decada.invalid`), então nem um app de banco
 * de verdade consegue pagá-lo.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Body, Button, Card, Chip, ErrorNotice, Field } from '.';
import { formatMoney } from '../services/format';
import { MIN_TOUCH_HEIGHT, colors, radius, spacing, typography } from '../theme/tokens';
import type { PaymentMethod } from '../types/api';
import type { usePaymentViewModel } from '../viewmodels/usePaymentViewModel';

type PagamentoVM = ReturnType<typeof usePaymentViewModel>;

const MEIOS: { metodo: PaymentMethod; rotulo: string }[] = [
  { metodo: 'pix', rotulo: 'Pix' },
  { metodo: 'cartao_credito', rotulo: 'Cartão de crédito' },
];

export const DICA_TITULAR =
  'Cartão de teste: o nome do titular decide a resposta. APRO aprova, OTHE recusa, FUND recusa por saldo e CONT fica em análise.';

export function PagamentoSimulado({ vm }: { vm: PagamentoVM }) {
  return (
    <View style={styles.conteudo}>
      <Card style={styles.resumo}>
        <Text style={styles.resumoRotulo}>VALOR A PAGAR</Text>
        <Text style={styles.total}>{formatMoney(vm.total)}</Text>
      </Card>

      <View accessibilityRole="tablist" style={styles.meios}>
        {MEIOS.map(({ metodo, rotulo }) => {
          const ativo = vm.metodo === metodo;
          return (
            <Pressable
              key={metodo}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativo }}
              onPress={() => vm.escolherMetodo(metodo)}
              style={[styles.meio, ativo && styles.meioAtivo]}
            >
              <Text style={[styles.meioRotulo, ativo && styles.meioRotuloAtivo]}>{rotulo}</Text>
            </Pressable>
          );
        })}
      </View>

      {vm.metodo === 'pix' ? <Pix vm={vm} /> : <Cartao vm={vm} />}

      {vm.recusa ? (
        <Card style={styles.recusa}>
          <Chip label="recusado" tone="danger" />
          <Body>{vm.recusa}. Confira os dados ou tente outro meio.</Body>
        </Card>
      ) : null}

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
    </View>
  );
}

function Pix({ vm }: { vm: PagamentoVM }) {
  const pix = vm.pixPendente;

  if (!pix?.pix_code) {
    return (
      <View style={styles.bloco}>
        <Body muted>
          O código Pix é gerado na hora e vale só para esta compra. Nenhum valor sai da sua conta.
        </Body>
        <Button
          label="Gerar Pix"
          onPress={vm.pagar}
          loading={vm.pagando}
          disabled={!vm.podePagar}
        />
      </View>
    );
  }

  return (
    <View style={styles.bloco}>
      <Chip label="aguardando pagamento" tone="warning" />
      <View
        style={styles.qr}
        accessible
        accessibilityRole="image"
        accessibilityLabel="QR code do Pix simulado"
      >
        <QRCode value={pix.pix_code} size={200} color={colors.primary} />
      </View>
      <Text style={styles.codigo} selectable numberOfLines={3}>
        {pix.pix_code}
      </Text>
      <Button
        label={vm.copiado ? 'Código copiado' : 'Copiar código Pix'}
        variant="secondary"
        onPress={vm.copiarPix}
      />
      <Body muted>
        Em uma compra de verdade, o banco avisaria o pagamento. Aqui, simule o recebimento.
      </Body>
      <Button
        label="Simular pagamento recebido"
        onPress={vm.simularRecebimento}
        loading={vm.recebendo}
      />
    </View>
  );
}

function Cartao({ vm }: { vm: PagamentoVM }) {
  const analise = vm.cartaoEmAnalise;

  if (analise) {
    return (
      <View style={styles.bloco}>
        <Chip label="em análise" tone="warning" />
        <Body>
          {analise.card_brand} final {analise.card_last_four}: {analise.status_detail}.
        </Body>
        <Button
          label="Simular aprovação"
          onPress={vm.simularRecebimento}
          loading={vm.recebendo}
        />
      </View>
    );
  }

  return (
    <View style={styles.bloco}>
      <Card style={styles.dica}>
        <Body muted>{DICA_TITULAR}</Body>
      </Card>
      <Field
        label="Número do cartão"
        value={vm.formulario.numero}
        onChangeText={(texto) => vm.alterarCampo('numero', texto)}
        keyboardType="number-pad"
        placeholder="4235 6477 2802 5682"
        autoComplete="off"
      />
      <Field
        label="Nome do titular"
        value={vm.formulario.titular}
        onChangeText={(texto) => vm.alterarCampo('titular', texto)}
        autoCapitalize="characters"
        placeholder="APRO"
        autoComplete="off"
      />
      <View style={styles.linha}>
        <View style={styles.metade}>
          <Field
            label="Validade"
            value={vm.formulario.validade}
            onChangeText={(texto) => vm.alterarCampo('validade', texto)}
            keyboardType="number-pad"
            placeholder="MM/AA"
          />
        </View>
        <View style={styles.metade}>
          <Field
            label="CVV"
            value={vm.formulario.cvv}
            onChangeText={(texto) => vm.alterarCampo('cvv', texto)}
            keyboardType="number-pad"
            placeholder="123"
            secureTextEntry
            autoComplete="off"
          />
        </View>
      </View>
      <Button
        label={`Pagar ${formatMoney(vm.total)}`}
        onPress={vm.pagar}
        loading={vm.pagando}
        disabled={!vm.podePagar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteudo: { gap: spacing.md },
  resumo: { backgroundColor: colors.primaryContainer, gap: spacing.xs2 },
  resumoRotulo: { ...typography.labelSm, color: colors.onPrimaryContainer },
  total: { ...typography.currency, color: colors.onPrimary },
  meios: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    padding: spacing.xs2,
    gap: spacing.xs2,
  },
  meio: {
    flex: 1,
    minHeight: MIN_TOUCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  meioAtivo: { backgroundColor: colors.surfaceContainerLowest },
  meioRotulo: { ...typography.labelLg, color: colors.onSurfaceVariant },
  meioRotuloAtivo: { color: colors.primary },
  bloco: { gap: spacing.sm },
  qr: {
    alignSelf: 'center',
    padding: spacing.md,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
  },
  codigo: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.DEFAULT,
    padding: spacing.sm,
  },
  dica: { backgroundColor: colors.surfaceContainerLow },
  recusa: { backgroundColor: colors.errorContainer, gap: spacing.xs2 },
  linha: { flexDirection: 'row', gap: spacing.sm },
  metade: { flex: 1 },
});
