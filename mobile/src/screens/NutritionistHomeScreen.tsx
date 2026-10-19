/**
 * Início da nutricionista: os planos alimentares que ela montou.
 *
 * Cada plano mostra para quem foi e onde está: rascunho, enviado, aceito ou
 * recusado. Nenhum protótipo desenhou a área da nutricionista; a tela segue os
 * cartões e a tipografia do sistema de design.
 */

import { useQuery } from '@tanstack/react-query';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from '../components';
import { readAccount, readPrescriptions } from '../services/api';
import { useAuth } from '../services/auth';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { PrescriptionStatus, PrescriptionSummary } from '../types/api';

const SITUACAO: Record<
  PrescriptionStatus,
  { rotulo: string; tom: 'neutral' | 'warning' | 'success' | 'danger' }
> = {
  rascunho: { rotulo: 'rascunho', tom: 'neutral' },
  enviada: { rotulo: 'enviado, aguardando o paciente', tom: 'warning' },
  aceita: { rotulo: 'aceito pelo paciente', tom: 'success' },
  recusada: { rotulo: 'recusado pelo paciente', tom: 'danger' },
};

export default function NutritionistHomeScreen({
  onNew,
  onOpen,
}: {
  onNew: () => void;
  onOpen: (prescriptionId: string) => void;
}) {
  const { signOut } = useAuth();
  const conta = useQuery({ queryKey: ['account'], queryFn: readAccount });
  const planos = useQuery({ queryKey: ['prescriptions'], queryFn: readPrescriptions });

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <View style={styles.cabecalho}>
        <Text style={styles.marca}>DÉCADA · NUTRICIONISTA</Text>
        <Text style={styles.titulo}>Planos alimentares</Text>
        {conta.data ? (
          <Body muted>
            {conta.data.full_name}
            {conta.data.crn ? ` · ${conta.data.crn}` : ''}
          </Body>
        ) : null}
      </View>

      <Button label="Novo plano" onPress={onNew} />

      {planos.isPending ? <Body muted>Carregando…</Body> : null}
      {planos.isError ? <ErrorNotice message="não foi possível carregar seus planos" /> : null}

      {planos.data?.length === 0 ? (
        <Card style={styles.vazio}>
          <Body>Você ainda não montou nenhum plano.</Body>
          <Body muted>
            Monte o plano com refeições, horários e substituições, e entregue pelo
            e-mail do paciente ou em PDF. A DÉCADA transforma os itens principais na
            lista de compras dele.
          </Body>
        </Card>
      ) : null}

      {planos.data?.map((plano) => (
        <Pressable
          key={plano.id}
          accessibilityRole="button"
          accessibilityLabel={`Abrir ${titulo(plano)}`}
          onPress={() => onOpen(plano.id)}
        >
          <Card style={styles.plano}>
            <Text style={styles.planoTitulo}>{titulo(plano)}</Text>
            <Text style={styles.planoDetalhe}>
              {[
                plano.patient_name,
                plano.patient_email,
                `${plano.meal_count} ${plano.meal_count === 1 ? 'refeição' : 'refeições'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Chip label={SITUACAO[plano.status].rotulo} tone={SITUACAO[plano.status].tom} />
          </Card>
        </Pressable>
      ))}

      <View style={styles.conta}>
        <SectionTitle>Conta</SectionTitle>
        <Button label="Sair da conta" variant="ghost" onPress={signOut} />
      </View>
    </ScrollView>
  );
}

function titulo(plano: PrescriptionSummary): string {
  return plano.title ?? (plano.patient_name ? `Plano de ${plano.patient_name}` : 'Plano sem título');
}

const styles = StyleSheet.create({
  conteudo: {
    padding: spacing.margin,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    flexGrow: 1,
  },
  cabecalho: { gap: spacing.xs, marginBottom: spacing.xs },
  marca: { ...typography.labelSm, color: colors.secondary, letterSpacing: 2 },
  titulo: { ...typography.headlineLg, color: colors.primary },
  vazio: { gap: spacing.xs },
  plano: { gap: spacing.xs },
  planoTitulo: { ...typography.headlineSm, color: colors.primary },
  planoDetalhe: { ...typography.labelSm, color: colors.onSurfaceVariant },
  conta: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
});
