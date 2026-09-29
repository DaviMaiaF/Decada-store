/**
 * Testes da simulação de cenário.
 *
 * A conta é em centavos de propósito, e estes testes existem para que ninguém
 * a "simplifique" de volta para ponto flutuante.
 */

import { simulatedDifference, simulatedTotal } from '../simulation';

const itens = [
  { id: 'a', estimated_cost: '12.31' },
  { id: 'b', estimated_cost: '5.32' },
  { id: 'c', estimated_cost: '0.10' },
];

it('sem nada excluído, o total é a soma de tudo', () => {
  expect(simulatedTotal(itens, new Set())).toBe('17.73');
});

it('item fora da simulação sai do total', () => {
  expect(simulatedTotal(itens, new Set(['a']))).toBe('5.42');
});

it('excluir tudo dá zero, e não vazio', () => {
  expect(simulatedTotal(itens, new Set(['a', 'b', 'c']))).toBe('0.00');
});

it('item sem preço entra como zero e não quebra a conta', () => {
  const comNulo = [...itens, { id: 'd', estimated_cost: null }];

  expect(simulatedTotal(comNulo, new Set())).toBe('17.73');
});

it('a soma não acumula erro de ponto flutuante', () => {
  // 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004.
  const centavos = [
    { id: 'a', estimated_cost: '0.10' },
    { id: 'b', estimated_cost: '0.20' },
  ];

  expect(simulatedTotal(centavos, new Set())).toBe('0.30');
});

it('tirar item deixa a diferença negativa', () => {
  const semA = simulatedTotal(itens, new Set(['a']));

  expect(simulatedDifference(semA, '17.73')).toBe('-12.31');
});

it('quantidade maior deixa a diferença positiva, e não vira economia', () => {
  // Simular mais leite encarece a compra. Chamar isso de economia seria mentir.
  expect(simulatedDifference('22.94', '17.63')).toBe('5.31');
});

it('cenário igual ao original dá zero', () => {
  expect(simulatedDifference('17.73', '17.73')).toBe('0.00');
});
