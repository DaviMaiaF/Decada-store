/**
 * Unidades e decimais na hora de dizer quanto se tem em casa.
 *
 * A escolha da unidade não é livre. Cada produto do catálogo é vendido em uma
 * grandeza (`base_unit`), e quantidade de outra grandeza não soma: o backend
 * trata "500 ml" de um produto vendido por quilo como item não medido, que
 * aparece na despensa e não abate nada da compra. Oferecer só as unidades
 * compatíveis é o que impede a tela de produzir esse item.
 */

import type { BaseUnit, MeasurementUnit, Product } from '../types/api';

const OPCOES: Record<BaseUnit, MeasurementUnit[]> = {
  kg: ['g', 'kg'],
  l: ['ml', 'l'],
  unidade: ['unidade'],
};

/** Unidades que somam com a grandeza em que o produto é vendido. */
export function unitOptions(baseUnit: BaseUnit): MeasurementUnit[] {
  return OPCOES[baseUnit] ?? ['unidade'];
}

/** "500.000" -> "500"; "1.500" -> "1,5". Decimal como se digita em português. */
export function amountToField(valor: string): string {
  return String(Number(valor)).replace('.', ',');
}

/**
 * Sugestão de preenchimento do campo, a partir da embalagem do produto.
 *
 * Quem tem arroz em casa costuma ter o pacote inteiro, então a embalagem é o
 * palpite mais provável. Produto sem embalagem declarada — ou com embalagem em
 * grandeza que não bate com a de venda — abre o campo vazio, sem chutar número.
 */
export function suggestedAmount(product: Product): {
  quantity: string;
  unit: MeasurementUnit;
} {
  const opcoes = unitOptions(product.base_unit);
  const embalagem =
    product.package_size !== null &&
    product.package_unit !== null &&
    opcoes.includes(product.package_unit);

  if (embalagem) {
    return { quantity: amountToField(product.package_size!), unit: product.package_unit! };
  }
  return { quantity: '', unit: opcoes[0] };
}

/**
 * "1,5" -> "1.5", para enviar à API. Devolve nulo quando não há número que
 * sirva — campo vazio, texto, zero ou negativo —, e nesse caso o item é
 * gravado sem quantidade em vez de com uma quantidade inventada.
 */
export function parseDecimal(text: string): string | null {
  const limpo = text.trim().replace(',', '.');
  if (limpo === '') return null;

  const numero = Number(limpo);
  if (!Number.isFinite(numero) || numero <= 0) return null;

  return String(numero);
}
