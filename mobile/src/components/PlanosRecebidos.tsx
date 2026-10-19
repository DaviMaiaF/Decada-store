/**
 * Planos que a nutricionista enviou ao e-mail do paciente, esperando resposta.
 *
 * Ficam na aba Dieta, ao lado do envio de PDF: são o outro jeito de o plano
 * chegar. Nada é gravado na conta antes do aceite com consentimento, o mesmo
 * termo do PDF (decisão 5). A pessoa lê o plano inteiro, com as substituições,
 * antes de decidir.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Checkbox, Chip, ErrorNotice, SectionTitle } from '.';
import { PlanoPrescrito } from './PlanoPrescrito';
import {
  ApiError,
  acceptPrescription,
  declinePrescription,
  readReceivedPrescriptions,
} from '../services/api';
import { colors, spacing, typography } from '../theme/tokens';
import type { ImportResult, ReceivedPrescription } from '../types/api';

export const RECEIVED_KEY = ['received-prescriptions'];

export function PlanosRecebidos({ onAccepted }: { onAccepted: (r: ImportResult) => void }) {
  const recebidos = useQuery({ queryKey: RECEIVED_KEY, queryFn: readReceivedPrescriptions });

  // Sem plano recebido, nada aparece: a tela do PDF segue como sempre foi.
  if (!recebidos.data?.length) return null;

  return (
    <View style={styles.lista}>
      {recebidos.data.map((plano) => (
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
  const cliente = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [aceitou, setAceitou] = useState(false);

  const depois = () => {
    cliente.invalidateQueries({ queryKey: RECEIVED_KEY });
    cliente.invalidateQueries({ queryKey: ['meal-plans'] });
  };

  const aceitar = useMutation({
    mutationFn: () => acceptPrescription(plano.id, aceitou),
    onSuccess: (resultado) => {
      depois();
      onAccepted(resultado);
    },
  });
  const recusar = useMutation({ mutationFn: () => declinePrescription(plano.id), onSuccess: depois });

  const erro = aceitar.error ?? recusar.error;
  const autora = [plano.author.full_name, plano.author.crn].filter(Boolean).join(' · ');

  return (
    <Card style={styles.cartao}>
      <Chip label="ENVIADO PELA SUA NUTRICIONISTA" tone="success" />
      <SectionTitle>{plano.title ?? 'Plano alimentar'}</SectionTitle>
      {autora ? <Body muted>{autora}</Body> : null}
      <Body muted>
        {plano.meals.length} {plano.meals.length === 1 ? 'refeição' : 'refeições'}. Os
        alimentos principais vão para a sua lista de compras; as substituições ficam
        no plano para você consultar.
      </Body>

      <Pressable accessibilityRole="button" onPress={() => setAberto((a) => !a)}>
        <Text style={styles.verPlano}>{aberto ? 'Ocultar o plano' : 'Ler o plano completo'}</Text>
      </Pressable>
      {aberto ? <PlanoPrescrito meals={plano.meals} notes={plano.notes} /> : null}

      <View style={styles.consentimento}>
        <Checkbox
          label={`Aceito o tratamento do plano ${plano.title ?? 'alimentar'}`}
          checked={aceitou}
          onPress={() => setAceitou((a) => !a)}
        />
        <Text style={styles.consentimentoTexto}>
          Autorizo a DÉCADA a tratar meu plano alimentar, que é dado sensível de saúde,
          para montar minha lista de compras. Posso apagar tudo quando quiser.
        </Text>
      </View>

      {erro ? (
        <ErrorNotice
          message={erro instanceof ApiError ? erro.message : 'não foi possível responder agora'}
        />
      ) : null}

      <Button
        label="Aceitar plano"
        onPress={() => aceitar.mutate()}
        disabled={!aceitou}
        loading={aceitar.isPending}
      />
      {!aceitou ? <Body muted>Marque o aceite para usar este plano.</Body> : null}
      <Button
        label="Recusar"
        variant="ghost"
        onPress={() => recusar.mutate()}
        loading={recusar.isPending}
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
