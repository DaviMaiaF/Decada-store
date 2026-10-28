/**
 * Fim da etapa Despensa: "terminei de dizer o que tenho em casa".
 *
 * Sem ele a aba não tinha fim — a pessoa cadastrava e não sabia se já podia
 * seguir, e a trilha ficava verde só por haver algum item, de antes ou não.
 * A lógica é do `usePantryReviewViewModel`; aqui só se desenha.
 */

import { StyleSheet } from "react-native";

import { Body, Button, Card, Chip, ErrorNotice, SectionTitle } from "./index";
import { spacing } from "../theme/tokens";
import { usePantryReviewViewModel } from "../viewmodels/usePantryReviewViewModel";

export function ConclusaoDaDespensa({
  planId,
  onConcluida,
}: {
  planId: string | null;
  /** Depois de concluir: a próxima etapa é a região, no Mercado. */
  onConcluida: () => void;
}) {
  const vm = usePantryReviewViewModel(planId);

  if (!vm.temPlano) return null;

  if (vm.concluida) {
    return (
      <Card style={styles.cartao}>
        <Chip label="DESPENSA REVISADA ✓" tone="success" />
        <Body muted>
          Pode continuar mexendo aqui quando quiser. Mudou algo depois de gerar
          a lista? O Mercado avisa.
        </Body>
        <Button
          label="Ir para o Mercado"
          variant="secondary"
          onPress={onConcluida}
        />
      </Card>
    );
  }

  return (
    <Card style={styles.cartao}>
      <SectionTitle>Terminou?</SectionTitle>
      <Body muted>
        Quando tiver dito o que já tem em casa, conclua: a próxima etapa é
        escolher a região e gerar a lista.
      </Body>
      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
      <Button
        label="Concluí a despensa"
        onPress={() => vm.concluir(onConcluida)}
        loading={vm.concluindo}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  cartao: { gap: spacing.xs },
});
