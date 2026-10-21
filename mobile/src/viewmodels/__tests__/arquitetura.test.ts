/**
 * Guarda da convenção MVVM (ver docs/arquitetura-mvvm.md).
 *
 * A View não fala com o backend nem com o React Query: isso é do ViewModel.
 * A lista cresce a cada tela migrada; quando todas estiverem nela, a regra vale
 * para o app inteiro.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRADAS: string[] = [
  'screens/HomeScreen.tsx',
  'screens/EconomyScreen.tsx',
  'screens/CheckoutScreen.tsx',
  'screens/NutritionistHomeScreen.tsx',
];

const PROIBIDOS = [/from '[./]*services\/api'/, /from '@tanstack\/react-query'/, /from '[./]*services\/auth'/];

it('as telas migradas não importam api, react-query nem auth', () => {
  const violacoes = MIGRADAS.flatMap((arquivo) => {
    const codigo = readFileSync(join(__dirname, '..', '..', arquivo), 'utf8');
    return PROIBIDOS.filter((padrao) => padrao.test(codigo)).map(
      (padrao) => `${arquivo}: ${padrao}`,
    );
  });

  expect(violacoes).toEqual([]);
});
