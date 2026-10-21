/**
 * Guarda da convenção MVVM (ver docs/arquitetura-mvvm.md).
 *
 * A View não fala com o backend, com o React Query nem com a sessão: isso é do
 * ViewModel. Vale para todo arquivo de `screens/` e `components/` — tela nova
 * que importar um deles quebra este teste.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');
const PASTAS_DA_VIEW = ['screens', 'components'];

const PROIBIDOS = [
  /from '[./]*services\/api'/,
  /from '@tanstack\/react-query'/,
  /from '[./]*services\/auth'/,
];

function arquivosDaView(): string[] {
  return PASTAS_DA_VIEW.flatMap((pasta) =>
    readdirSync(join(RAIZ, pasta))
      .filter((nome) => nome.endsWith('.tsx'))
      .map((nome) => `${pasta}/${nome}`),
  );
}

it('encontra as telas e os componentes', () => {
  // Sem isto, um caminho errado faria o teste abaixo passar sem olhar nada.
  expect(arquivosDaView()).toEqual(
    expect.arrayContaining(['screens/MarketScreen.tsx', 'components/DespensaPorFoto.tsx']),
  );
});

it('nenhuma tela ou componente importa api, react-query ou auth', () => {
  const violacoes = arquivosDaView().flatMap((arquivo) => {
    const codigo = readFileSync(join(RAIZ, arquivo), 'utf8');
    return PROIBIDOS.filter((padrao) => padrao.test(codigo)).map(
      (padrao) => `${arquivo}: ${padrao}`,
    );
  });

  expect(violacoes).toEqual([]);
});
