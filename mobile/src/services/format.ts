/**
 * Formatação de números que chegam da API como string.
 *
 * A conversão para `Number` acontece só na hora de exibir, nunca para somar.
 * Totais são calculados no servidor, onde o Python usa Decimal.
 */

/** "12.9" -> "R$ 12,90". Devolve o traço quando não há preço. */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

/**
 * "0.700" + "kg" -> "700 g". A API grava na unidade base do produto; quem
 * traduz para a unidade que cabe na tela é o cliente.
 */
export function formatQuantity(value: string, unit: string): string {
  const quantity = Number(value);

  if (unit === 'kg' && quantity < 1) return `${Math.round(quantity * 1000)} g`;
  if (unit === 'l' && quantity < 1) return `${Math.round(quantity * 1000)} ml`;
  if (unit === 'unidade') {
    const rounded = Math.round(quantity);
    return `${rounded} ${rounded === 1 ? 'unidade' : 'unidades'}`;
  }

  const texto = quantity.toFixed(quantity % 1 === 0 ? 0 : 3).replace(/\.?0+$/, '');
  return `${texto.replace('.', ',')} ${unit}`;
}

/** Selo de confiança do preço, como texto para a tela. */
export function describeConfidence(
  confidence: string | null,
  referenceDate: string | null,
): string {
  if (!confidence || !referenceDate) return 'sem preço coletado nesta região';

  const dias = Math.floor(
    (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24),
  );
  const idade = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;

  // Preço com mais de 30 dias é estimativa, e a tela precisa dizer isso.
  if (confidence === 'estimativa') return `estimativa — coletado ${idade}`;
  return `coletado ${idade}`;
}

const ORIGENS: Record<string, string> = {
  nfce: 'nota fiscal',
  scraping: 'coleta automática',
  usuario: 'informado por usuário',
  seed: 'dado fictício de desenvolvimento',
};

export function describeOrigin(origin: string | null): string {
  return origin ? (ORIGENS[origin] ?? origin) : '—';
}
