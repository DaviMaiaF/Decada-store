/**
 * Simulação de cenário da lista de compras.
 *
 * Responde "e se eu não levar isto?" sem tocar na lista salva nem na prescrição
 * — a decisão 8 é clara: o app não troca o que a nutricionista prescreveu. Aqui
 * nada é enviado ao servidor; é uma conta de cabeça feita na tela.
 *
 * A soma é em centavos, com inteiros. Somar `Number("5.32") + Number("12.31")`
 * em ponto flutuante acumula erro e produz total com casas que não existem,
 * justamente no número que a pessoa usa para decidir a compra.
 */

/** O mínimo que a simulação precisa saber de um item. */
export type ItemSimulavel = {
  id: string;
  estimated_cost: string | null;
};

function paraCentavos(valor: string | null): number {
  if (valor === null) return 0;
  return Math.round(Number(valor) * 100);
}

/**
 * Total dos itens que continuam na simulação, no formato que a API usa.
 *
 * Item sem preço entra como zero, e não como erro: a lista já mostra "sem preço
 * coletado nesta região" em cada um deles, e o total sempre foi só do que tem
 * preço conhecido.
 */
export function simulatedTotal(items: ItemSimulavel[], excluded: Set<string>): string {
  const centavos = items
    .filter((item) => !excluded.has(item.id))
    .reduce((soma, item) => soma + paraCentavos(item.estimated_cost), 0);

  return (centavos / 100).toFixed(2);
}

/** Quanto a simulação tira da compra, em relação a levar tudo. */
export function simulatedSavings(items: ItemSimulavel[], excluded: Set<string>): string {
  const tudo = items.reduce((soma, item) => soma + paraCentavos(item.estimated_cost), 0);
  const escolhido = items
    .filter((item) => !excluded.has(item.id))
    .reduce((soma, item) => soma + paraCentavos(item.estimated_cost), 0);

  return ((tudo - escolhido) / 100).toFixed(2);
}
