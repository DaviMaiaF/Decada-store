/**
 * Aviso de lista que ficou para trás do plano.
 *
 * A lista é um retrato: produto e preço ficam congelados na geração. Quem troca
 * o produto na aba Dieta depois disso via o antigo no Mercado e no checkout sem
 * explicação nenhuma. A lista não se corrige sozinha — o total deixaria de ser
 * reproduzível, e as marcações de "comprado" iriam junto —, então a tela diz o
 * que divergiu e oferece gerar de novo, na mesma região.
 */

import { useMutation } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { Body, Button, Card, ErrorNotice, SectionTitle } from '.';
import { ApiError, generateShoppingList } from '../services/api';
import { colors, spacing } from '../theme/tokens';
import type { OutdatedItem, PlanChange, ShoppingList } from '../types/api';

const MOTIVO: Record<PlanChange, string> = {
  produto_trocado: 'produto trocado',
  nao_confirmado: 'não está mais confirmado',
  novo_confirmado: 'confirmado depois da lista',
};

export function descreverDivergencia(item: OutdatedItem): string {
  return `${item.description} — ${MOTIVO[item.change]}`;
}

export function ListaDesatualizada({
  lista,
  onGenerated,
}: {
  lista: ShoppingList;
  onGenerated: (listId: string) => void;
}) {
  const geracao = useMutation({
    mutationFn: () => generateShoppingList(lista.meal_plan_id, lista.state_code, lista.city),
    onSuccess: (resultado) => onGenerated(resultado.shopping_list.id),
  });

  if (lista.outdated_items.length === 0) return null;

  return (
    <Card style={styles.aviso}>
      <SectionTitle>Seu plano mudou depois desta lista</SectionTitle>
      <Body muted>
        A lista mostra o que estava confirmado quando foi gerada. Gere de novo para
        trazer o que você mudou na aba Dieta.
      </Body>
      {lista.outdated_items.map((item) => (
        <Body key={item.plan_item_id}>• {descreverDivergencia(item)}</Body>
      ))}
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
        label="Gerar lista atualizada"
        variant="secondary"
        onPress={() => geracao.mutate()}
        loading={geracao.isPending}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  aviso: { backgroundColor: colors.errorContainer, gap: spacing.xs2 },
});
