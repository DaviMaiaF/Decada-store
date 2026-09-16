/**
 * Aba Economia.
 *
 * Nenhum protótipo desenhou esta tela, e a decisão do projeto é dura com ela:
 * número de economia sem base não aparece. Por isso aqui só há conta que o
 * servidor sabe fazer — o total da lista, o que já foi para o carrinho e o que
 * a despensa poupou. "Desperdício evitado" e "previsão mensal", que os outros
 * protótipos mostravam, continuam de fora porque não há como calcular.
 *
 * A conta e o botão de sair ficam no rodapé: o app guarda dado de saúde e
 * precisa ter uma saída visível, e nenhuma das quatro telas do protótipo
 * previu onde colocá-la.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { Body, Button, Card, Chip, ErrorNotice, ProgressBar, SectionTitle } from '../components';
import { readShoppingList } from '../services/api';
import { useAuth } from '../services/auth';
import { describeConfidence, formatMoney } from '../services/format';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { ShoppingList, ShoppingListItem } from '../types/api';

export default function EconomyScreen({ listId }: { listId: string | null }) {
  const lista = useQuery({
    queryKey: ['shopping-list', listId],
    queryFn: () => readShoppingList(listId!),
    enabled: listId !== null,
  });

  return (
    <ScrollView contentContainerStyle={styles.conteudo}>
      <Text style={styles.titulo}>Economia</Text>

      {listId === null ? (
        <Body muted>
          Gere sua lista na aba Mercado para ver quanto ela custa e quanto a sua
          despensa já poupou.
        </Body>
      ) : lista.isPending ? (
        <Body muted>Carregando…</Body>
      ) : lista.isError ? (
        <ErrorNotice message="não foi possível carregar a lista" />
      ) : (
        <Resumo lista={lista.data} />
      )}

      <View style={styles.conta}>
        <SectionTitle>Conta</SectionTitle>
        <Sair />
      </View>
    </ScrollView>
  );
}

function Sair() {
  const { signOut } = useAuth();
  return <Button label="Sair da conta" variant="ghost" onPress={signOut} />;
}

/** Soma os valores de uma coluna de dinheiro, ignorando o que não tem preço. */
function somar(itens: ShoppingListItem[], campo: 'estimated_cost' | 'pantry_savings'): number {
  return itens.reduce((total, item) => total + Number(item[campo] ?? 0), 0);
}

function Resumo({ lista }: { lista: ShoppingList }) {
  const aComprar = lista.items.filter((item) => !item.dispensed_by_pantry);
  const comprados = aComprar.filter((item) => item.purchased);

  const jaNoCarrinho = somar(comprados, 'estimated_cost');
  const total = Number(lista.estimated_total ?? 0);
  const falta = Math.max(total - jaNoCarrinho, 0);
  const percentual = total === 0 ? 0 : (jaNoCarrinho / total) * 100;

  const economia = somar(lista.items, 'pantry_savings');
  const comPreco = lista.items.filter((item) => item.estimated_cost !== null);
  const semPreco = lista.items.length - comPreco.length;

  // O selo mais fraco manda no aviso: dizer "atual" quando um item é estimativa
  // daria à lista inteira uma confiança que ela não tem.
  const maisFraco = piorSelo(comPreco);
  const ficticio = lista.items.some((item) => item.product.is_fictitious);

  return (
    <>
      <Card style={styles.destaque}>
        <Text style={styles.destaqueRotulo}>A DESPENSA POUPOU</Text>
        <Text style={styles.destaqueValor}>{formatMoney(economia.toFixed(2))}</Text>
        <Text style={styles.destaqueNota}>
          {economia === 0
            ? 'Nada em casa entrou nesta lista — ou o que havia não chegou a tirar uma embalagem do carrinho.'
            : 'É o que a lista custaria sem o que você já tinha em casa, menos o que ela custa agora.'}
        </Text>
      </Card>

      <Card>
        <SectionTitle>Esta compra</SectionTitle>
        <Linha rotulo="Total estimado" valor={formatMoney(lista.estimated_total)} />
        <Linha rotulo="Já no carrinho" valor={formatMoney(jaNoCarrinho.toFixed(2))} />
        <Linha rotulo="Ainda falta" valor={formatMoney(falta.toFixed(2))} />
        <View style={styles.progresso}>
          <ProgressBar percent={percentual} />
          <Text style={styles.progressoTexto}>
            {comprados.length} de {aComprar.length} itens comprados
          </Text>
        </View>
        <Text style={styles.regiao}>
          Preços de {lista.city} · {lista.state_code}
        </Text>
      </Card>

      <Card>
        <SectionTitle>De onde vêm estes números</SectionTitle>
        <Linha rotulo="Itens com preço" valor={String(comPreco.length)} />
        <Linha rotulo="Sem preço na região" valor={String(semPreco)} />
        {maisFraco ? (
          <Text style={styles.procedencia}>
            O preço mais fraco da lista foi {describeConfidence(
              maisFraco.price_confidence,
              maisFraco.price_reference_date,
            )}
            .
          </Text>
        ) : null}
        {semPreco > 0 ? (
          <Body muted>
            Item sem preço na sua região fica fora do total. Zero seria mentira.
          </Body>
        ) : null}
        {ficticio ? <Chip label="dado fictício de desenvolvimento" tone="warning" /> : null}
      </Card>
    </>
  );
}

/** O item de selo mais fraco: estimativa perde de recente, que perde de atual. */
function piorSelo(itens: ShoppingListItem[]): ShoppingListItem | null {
  const ordem = ['atual', 'recente', 'estimativa'];
  let pior: ShoppingListItem | null = null;

  for (const item of itens) {
    if (item.price_confidence === null) continue;
    if (pior === null) pior = item;
    else if (ordem.indexOf(item.price_confidence) > ordem.indexOf(pior.price_confidence!)) {
      pior = item;
    }
  }

  return pior;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={styles.linhaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  conteudo: {
    padding: spacing.margin,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    flexGrow: 1,
  },
  titulo: { ...typography.headlineLg, color: colors.primary },

  destaque: { backgroundColor: colors.primaryContainer, gap: spacing.xs },
  destaqueRotulo: { ...typography.labelSm, color: colors.surface, letterSpacing: 1 },
  destaqueValor: { ...typography.headlineLg, color: colors.surface },
  destaqueNota: { ...typography.bodySm, color: colors.surface },

  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  linhaRotulo: { ...typography.bodyMd, color: colors.onSurfaceVariant },
  linhaValor: { ...typography.bodyMd, color: colors.onSurface },

  progresso: { gap: spacing.xs, marginTop: spacing.xs },
  progressoTexto: { ...typography.bodySm, color: colors.onSurfaceVariant },
  regiao: { ...typography.bodySm, color: colors.onSurfaceVariant, marginTop: spacing.xs },
  procedencia: { ...typography.bodySm, color: colors.onSurfaceVariant },

  conta: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
});
