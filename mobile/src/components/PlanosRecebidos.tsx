/**
 * Planos que a nutricionista enviou ao e-mail do paciente, esperando resposta.
 *
 * Ficam na aba Dieta, ao lado do envio de PDF: são o outro jeito de o plano
 * chegar. Nada é gravado na conta antes do aceite com consentimento, o mesmo
 * termo do PDF (decisão 5). A pessoa lê o plano inteiro, com as substituições,
 * antes de decidir.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Checkbox, Chip, ErrorNotice, SectionTitle } from '.';
import { PlanoPrescrito } from './PlanoPrescrito';
import { colors, spacing, typography } from '../theme/tokens';
import type { ImportResult, ReceivedPrescription } from '../types/api';
import {
  useReceivedPrescriptionViewModel,
  useReceivedPrescriptionsViewModel,
} from '../viewmodels/useReceivedPrescriptionsViewModel';

export function PlanosRecebidos({ onAccepted }: { onAccepted: (r: ImportResult) => void }) {
  const { planos } = useReceivedPrescriptionsViewModel();

  // Sem plano recebido, nada aparece: a tela do PDF segue como sempre foi.
  if (!planos.length) return null;

  return (
    <View style={styles.lista}>
      {planos.map((plano) => (
        <PlanoRecebido key={plano.id} plano={plano} onAccepted={onAccepted} />
      ))}
    </View>
  );
}

function PlanoRecebido({
  plano,
  onAccepted,
}: {
  plano: ReceivedPrescription;
  onAccepted: (r: ImportResult) => void;
}) {
  const vm = useReceivedPrescriptionViewModel(plano, onAccepted);

  return (
    <Card style={styles.cartao}>
      <Chip label="ENVIADO PELA SUA NUTRICIONISTA" tone="success" />
      <SectionTitle>{plano.title ?? 'Plano alimentar'}</SectionTitle>
      {vm.autora ? <Body muted>{vm.autora}</Body> : null}
      <Body muted>
        {plano.meals.length} {plano.meals.length === 1 ? 'refeição' : 'refeições'}. Os
        alimentos principais vão para a sua lista de compras; as substituições ficam
        no plano para você consultar.
      </Body>

      <Pressable accessibilityRole="button" onPress={vm.alternarLeitura}>
        <Text style={styles.verPlano}>{vm.aberto ? 'Ocultar o plano' : 'Ler o plano completo'}</Text>
      </Pressable>
      {vm.aberto ? <PlanoPrescrito meals={plano.meals} notes={plano.notes} /> : null}

      <View style={styles.consentimento}>
        <Checkbox
          label={`Aceito o tratamento do plano ${plano.title ?? 'alimentar'}`}
          checked={vm.aceitou}
          onPress={vm.alternarAceite}
        />
        <Text style={styles.consentimentoTexto}>
          Autorizo a DÉCADA a tratar meu plano alimentar, que é dado sensível de saúde,
          para montar minha lista de compras. Posso apagar tudo quando quiser.
        </Text>
      </View>

      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}

      <Button
        label="Aceitar plano"
        onPress={vm.aceitar}
        disabled={!vm.aceitou}
        loading={vm.aceitando}
      />
      {!vm.aceitou ? <Body muted>Marque o aceite para usar este plano.</Body> : null}
      <Button
        label="Recusar"
        variant="ghost"
        onPress={vm.recusar}
        loading={vm.recusando}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  lista: { gap: spacing.sm },
  cartao: { gap: spacing.sm },
  verPlano: { ...typography.labelLg, color: colors.primary },
  consentimento: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  consentimentoTexto: { ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 },
});
