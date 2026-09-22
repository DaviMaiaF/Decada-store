/**
 * Testes das unidades da despensa.
 *
 * A regra que importa é a da compatibilidade: oferecer uma unidade de outra
 * grandeza produziria item que aparece na despensa e não abate nada da compra.
 */

import { parseDecimal, suggestedAmount, unitOptions } from '../units';
import type { Product } from '../../types/api';

function produto(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Arroz branco',
    brand: null,
    category: 'mercearia',
    base_unit: 'kg',
    package_size: null,
    package_unit: null,
    is_fictitious: false,
    ...over,
  };
}

describe('unitOptions', () => {
  it('oferece grama e quilo para produto vendido por quilo', () => {
    expect(unitOptions('kg')).toEqual(['g', 'kg']);
  });

  it('oferece mililitro e litro para produto vendido por litro', () => {
    expect(unitOptions('l')).toEqual(['ml', 'l']);
  });

  it('não dá escolha para produto vendido por unidade', () => {
    expect(unitOptions('unidade')).toEqual(['unidade']);
  });
});

describe('suggestedAmount', () => {
  it('sugere a embalagem do produto', () => {
    expect(suggestedAmount(produto({ package_size: '5.000', package_unit: 'kg' }))).toEqual({
      quantity: '5',
      unit: 'kg',
    });
  });

  it('escreve o decimal com vírgula, como se digita', () => {
    expect(suggestedAmount(produto({ package_size: '1.500', package_unit: 'l', base_unit: 'l' })))
      .toEqual({ quantity: '1,5', unit: 'l' });
  });

  it('abre o campo vazio quando a embalagem não foi declarada', () => {
    expect(suggestedAmount(produto())).toEqual({ quantity: '', unit: 'g' });
  });

  it('ignora embalagem de outra grandeza em vez de sugerir o incompatível', () => {
    // Produto vendido por quilo com embalagem em unidade: sugerir "1 unidade"
    // daria item que não soma. Melhor não chutar.
    expect(suggestedAmount(produto({ package_size: '1.000', package_unit: 'unidade' }))).toEqual({
      quantity: '',
      unit: 'g',
    });
  });
});

describe('parseDecimal', () => {
  it('troca a vírgula pelo ponto que a API espera', () => {
    expect(parseDecimal('1,5')).toBe('1.5');
  });

  it('aceita número inteiro', () => {
    expect(parseDecimal('300')).toBe('300');
  });

  it('ignora espaço em volta', () => {
    expect(parseDecimal('  2,25 ')).toBe('2.25');
  });

  it('devolve nulo para campo vazio', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
  });

  it('devolve nulo para texto que não é número', () => {
    expect(parseDecimal('meio quilo')).toBeNull();
  });

  it('devolve nulo para zero e para negativo', () => {
    // O backend exige quantidade maior que zero; "0" é ausência, não medida.
    expect(parseDecimal('0')).toBeNull();
    expect(parseDecimal('-3')).toBeNull();
  });
});
