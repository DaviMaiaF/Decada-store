/**
 * Smoke test de ponta a ponta: o cliente real contra o backend real.
 *
 * Não roda na suíte comum — precisa do Postgres e do uvicorn de pé. O que ele
 * prova é o que o teste de unidade não alcança: que o axios e a FastAPI
 * conversam de fato, com token, multipart, 204 e 401 de verdade.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ApiError } from '../src/services/api';
import * as api from '../src/services/api';
import { http } from '../src/services/http';

/**
 * No celular o axios roda o build de browser, que fala por XMLHttpRequest. Aqui
 * não existe XHR, então o teste usa o build de node, que fala pelo módulo http.
 * O cliente da DÉCADA é o mesmo nos dois: o adaptador é detalhe do axios.
 */
jest.mock('axios', () => {
  const buildDeNode = require('node:path').join(
    __dirname,
    '..',
    'node_modules/axios/dist/node/axios.cjs',
  );
  return require(buildDeNode);
});

// A tela web é a única forma de montar o multipart fora do React Native: o
// descritor de arquivo do RN não existe aqui.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

// Cofre do token em memória, no lugar do SecureStore.
jest.mock('../src/services/session', () => {
  let guardado: string | null = null;
  return {
    readToken: async () => guardado,
    saveToken: async (token: string) => {
      guardado = token;
    },
    clearToken: async () => {
      guardado = null;
    },
  };
});

const { saveToken } = jest.requireMock('../src/services/session');

/** O PDF de demonstração do repositório, com texto selecionável. */
const PLANO_DE_EXEMPLO = join(__dirname, '..', '..', 'docs', 'demo', 'plano-exemplo.pdf');

const EMAIL = `smoke-${Date.now()}@example.com`;
const SENHA = 'decada-smoke-2026';

beforeAll(() => {
  // Sem XMLHttpRequest neste ambiente; no celular o axios usa o adaptador dele.
  http.defaults.adapter = 'http';

  // O PDF é lido do disco e vira Blob, que é o formato do caminho web.
  global.fetch = (async (caminho: string) => {
    const bytes = readFileSync(caminho);
    return { blob: async () => new Blob([bytes], { type: 'application/pdf' }) };
  }) as unknown as typeof fetch;
});

jest.setTimeout(120_000);

it('percorre o app de ponta a ponta', async () => {
  const passo = (texto: string) => console.log(`  → ${texto}`);

  // 1. conta
  const token = await api.register(EMAIL, SENHA, 'Marina Smoke');
  await saveToken(token.access_token);
  passo(`cadastro: token de ${token.access_token.length} caracteres`);

  const conta = await api.readAccount();
  expect(conta.email).toBe(EMAIL);
  passo(`GET /auth/me devolveu ${conta.email}`);

  // 2. plano alimentar: multipart com o PDF de exemplo
  const importado = await api.importMealPlan(
    { uri: PLANO_DE_EXEMPLO, name: 'plano.pdf' },
    true,
    { nutritionistName: 'Dra. Helena Marques', nutritionistCrn: 'CRN-1 12345' },
  );
  const planoId = importado.meal_plan.id;
  passo(
    `PDF importado: ${importado.items_created} itens lidos, ` +
        `${importado.items_matched} com candidato, ` +
      `${importado.items_unidentified} não identificados`,
  );

  const planos = await api.readMealPlans();
  expect(planos.map((plano) => plano.id)).toContain(planoId);
  passo(`GET /meal-plans listou ${planos.length} plano(s)`);

  // 3. casamento item–produto: o usuário confirma, item a item
  const plano = await api.readMealPlan(planoId);
  expect(plano.nutritionist_name).toBe('Dra. Helena Marques');
  expect(plano.nutritionist_crn).toBe('CRN-1 12345');
  let confirmados = 0;
  for (const item of plano.items) {
    const candidatos = await api.readCandidates(planoId, item.id);
    if (candidatos.length === 0) continue;
    await api.confirmItem(planoId, item.id, candidatos[0].product.id, candidatos[0].score);
    confirmados += 1;
  }
  passo(`${confirmados} de ${plano.items.length} itens confirmados`);

  // 4. lista de compras com custo estimado
  const gerada = await api.generateShoppingList(planoId, 'DF', 'Brasília');
  const listaId = gerada.shopping_list.id;
  passo(`lista gerada: total estimado R$ ${gerada.shopping_list.estimated_total}`);

  const lista = await api.readShoppingList(listaId);
  expect(lista.items.length).toBeGreaterThan(0);
  passo(`GET /shopping-lists/${listaId.slice(0, 8)}… trouxe ${lista.items.length} itens`);

  // 5. despensa e busca no catálogo
  const sugestoes = await api.searchProducts('aveia');
  expect(sugestoes.length).toBeGreaterThan(0);
  passo(`busca "aveia" achou ${sugestoes.length} produtos`);

  const naDespensa = await api.addPantryItem({
    raw_description: 'aveia em flocos',
    product_id: sugestoes[0].product.id,
    quantity: '500',
    unit: 'g',
  });
  // Item sem produto não abate da compra nem conta para as receitas.
  expect(naDespensa.product?.id).toBe(sugestoes[0].product.id);

  const despensa = await api.readPantry();
  expect(despensa.map((item) => item.id)).toContain(naDespensa.id);
  passo(`despensa com ${despensa.length} item(ns), ligado a "${naDespensa.product?.name}"`);

  // 6. receitas
  const receitas = await api.readRecipeSuggestions(listaId);
  passo(
    `${receitas.length} receitas sugeridas; ` +
      `a melhor tem ${receitas[0]?.percentage}% dos ingredientes`,
  );

  // 7. o 204 do DELETE
  const semCorpo = await api.removePantryItem(naDespensa.id);
  expect(semCorpo).toBeUndefined();
  passo('DELETE /pantry devolveu 204 sem corpo');

  // 8. o 401 que derruba a sessão, com a mensagem do servidor
  const recusado = await api.login(EMAIL, 'senha-errada').catch((problema) => problema);
  expect(recusado).toBeInstanceOf(ApiError);
  expect((recusado as ApiError).isUnauthorized).toBe(true);
  passo(`senha errada: 401 "${(recusado as ApiError).message}"`);

  // 9. exclusão de conta apaga a linha de verdade (decisão 9)
  await api.deleteAccount();
  const depois = await api.readAccount().catch((problema) => problema);
  expect((depois as ApiError).status).toBe(401);
  passo('conta excluída; o mesmo token já não vale');
});
