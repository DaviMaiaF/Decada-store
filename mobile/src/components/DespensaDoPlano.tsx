/**
 * "Do seu plano": pergunta, item a item, se a pessoa tem em casa o que o plano
 * confirmado pede. A lógica é do ViewModel; aqui só se desenha.
 */

import { StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, ErrorNotice, SectionTitle } from './index';
import { colors, spacing, typography } from '../theme/tokens';
import { usePantryGuideViewModel } from '../viewmodels/usePantryGuideViewModel';

export function DespensaDoPlano({ planId }: { planId: string | null }) {
  const vm = usePantryGuideViewModel(planId);

  if (vm.perguntas.length === 0) return null;

  return (
    <Card style={styles.cartao}>
      <SectionTitle>Do seu plano</SectionTitle>
      <Body muted>
        Marque o que você já tem em casa: isso será descontado da lista de compras.
      </Body>

      {vm.perguntas.map((item) => (
        <View key={item.id} style={styles.linha}>
          <Text style={styles.nome}>{item.product!.name}</Text>
          <View style={styles.botoes}>
            <Button
              label="Tenho"
              onPress={() => vm.tenho(item)}
              loading={vm.guardandoId === item.product!.id}
            />
            <Button label="Não tenho" variant="ghost" onPress={() => vm.naoTenho(item)} />
          </View>
        </View>
      ))}

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: spacing.xs },
  linha: { gap: spacing.xs, paddingTop: spacing.xs },
  nome: { ...typography.bodyMd, color: colors.onSurface },
  botoes: { flexDirection: 'row', gap: spacing.xs },
});
