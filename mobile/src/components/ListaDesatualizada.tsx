/**
 * Aviso de lista que ficou para trás do plano.
 *
 * A lista é um retrato: produto e preço ficam congelados na geração. Quem troca
 * o produto na aba Dieta depois disso via o antigo no Mercado e no checkout sem
 * explicação nenhuma. A lista não se corrige sozinha — o total deixaria de ser
 * reproduzível, e as marcações de "comprado" iriam junto —, então a tela diz o
 * que divergiu e oferece gerar de novo, na mesma região.
 */

import { StyleSheet } from 'react-native';

import { Body, Button, Card, ErrorNotice, SectionTitle } from '.';
import { colors, spacing } from '../theme/tokens';
import type { ShoppingList } from '../types/api';
import { useOutdatedListViewModel } from '../viewmodels/useOutdatedListViewModel';

export function ListaDesatualizada({
  lista,
  onGenerated,
}: {
  lista: ShoppingList;
  onGenerated: (listId: string) => void;
}) {
  const vm = useOutdatedListViewModel(lista, onGenerated);

  if (!vm.desatualizada) return null;

  return (
    <Card style={styles.aviso}>
      <SectionTitle>Seu plano mudou depois desta lista</SectionTitle>
      <Body muted>
        A lista mostra o que estava confirmado quando foi gerada. Gere de novo para
        trazer o que você mudou na aba Dieta.
      </Body>
      {vm.divergencias.map(({ id, texto }) => (
        <Body key={id}>• {texto}</Body>
      ))}
      {vm.erro ? <ErrorNotice message={vm.erro} /> : null}
      <Button
        label="Gerar lista atualizada"
        variant="secondary"
        onPress={vm.gerar}
        loading={vm.gerando}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  aviso: { backgroundColor: colors.errorContainer, gap: spacing.xs2 },
});
