/**
 * Testes da passagem do formulário de receita para o corpo da API.
 *
 * São as regras do servidor repetidas aqui para o erro aparecer antes de ir à
 * rede: sem nome, sem ingrediente, só opcionais, quantidade que não é número.
 */

import {
  EMPTY_FORM,
  buildRecipeInput,
  formFromRecipe,
  newIngredient,
  type RecipeForm,
} from '../recipeForm';
import type { Product, Recipe } from '../../types/api';

function produto(nome: string, over: Partial<Product> = {}): Product {
  return {
    id: `produto-${nome}`,
    name: nome,
    brand: null,
    category: 'mercearia',
    base_unit: 'kg',
    package_size: '500',
    package_unit: 'g',
    is_fictitious: false,
    ...over,
  };
}

const OVOS = produto('Ovos de galinha', { base_unit: 'unidade' });
const AVEIA = produto('Aveia em flocos');

function formulario(over: Partial<RecipeForm> = {}): RecipeForm {
  return {
    ...EMPTY_FORM,
    name: 'Omelete',
    ingredients: [{ ...newIngredient(OVOS), quantity: '2' }],
    ...over,
  };
}

it('monta o corpo com os números convertidos', () => {
  const { input, error } = buildRecipeInput(
    formulario({
      name: '  Omelete  ',
      servings: '2',
      prepMinutes: '15',
      instructions: '  Bata os ovos.  ',
      ingredients: [
        { ...newIngredient(OVOS), quantity: '2' },
        { ...newIngredient(AVEIA), quantity: '1,5', unit: 'kg', optional: true },
      ],
    }),
  );

  expect(error).toBeNull();
  expect(input).toEqual({
    name: 'Omelete',
    instructions: 'Bata os ovos.',
    servings: 2,
    prep_minutes: 15,
    ingredients: [
      { product_id: OVOS.id, quantity: '2', unit: 'unidade', optional: false },
      { product_id: AVEIA.id, quantity: '1.5', unit: 'kg', optional: true },
    ],
  });
});

it('campos opcionais vazios vão como nulos', () => {
  const { input } = buildRecipeInput(formulario());

  expect(input).toMatchObject({ instructions: null, servings: null, prep_minutes: null });
});

it('recusa receita sem nome', () => {
  expect(buildRecipeInput(formulario({ name: '   ' })).error).toBe('dê um nome à receita');
});

it('recusa receita sem ingrediente', () => {
  expect(buildRecipeInput(formulario({ ingredients: [] })).error).toBe(
    'adicione pelo menos um ingrediente',
  );
});

it('recusa receita só de opcionais', () => {
  const soOpcional = formulario({
    ingredients: [{ ...newIngredient(OVOS), quantity: '2', optional: true }],
  });

  expect(buildRecipeInput(soOpcional).error).toBe(
    'a receita precisa de pelo menos um ingrediente obrigatório',
  );
});

it.each(['', 'muito', '0', '-2'])('recusa quantidade %p e diz de qual ingrediente', (texto) => {
  const resultado = buildRecipeInput(
    formulario({ ingredients: [{ ...newIngredient(OVOS), quantity: texto }] }),
  );

  expect(resultado.error).toBe('informe a quantidade de Ovos de galinha');
});

it('recusa unidade de outra grandeza que a do produto', () => {
  const resultado = buildRecipeInput(
    formulario({ ingredients: [{ ...newIngredient(AVEIA), quantity: '200', unit: 'ml' }] }),
  );

  expect(resultado.error).toBe('Aveia em flocos não se mede em ml');
});

it.each(['0', '2,5', 'dois', '101'])('recusa rendimento %p', (texto) => {
  expect(buildRecipeInput(formulario({ servings: texto })).error).toMatch(/rendimento/);
});

it('recusa tempo de preparo que não é minuto inteiro', () => {
  expect(buildRecipeInput(formulario({ prepMinutes: '10,5' })).error).toMatch(/preparo/);
});

it('ingrediente novo começa sem quantidade, na menor unidade da grandeza', () => {
  expect(newIngredient(AVEIA)).toEqual({
    product: AVEIA,
    quantity: '',
    unit: 'g',
    optional: false,
  });
});

it('preenche o formulário com a receita salva', () => {
  const salva: Recipe = {
    id: 'r1',
    slug: 'omelete-ab12',
    name: 'Omelete',
    servings: 1,
    prep_minutes: null,
    instructions: null,
    is_fictitious: false,
    author: { full_name: 'Camila Fernandes', crn: 'CRN-3 48291' },
    ingredients: [{ product: AVEIA, quantity: '20.000', unit: 'g', optional: true }],
  };

  expect(formFromRecipe(salva)).toEqual({
    name: 'Omelete',
    instructions: '',
    servings: '1',
    prepMinutes: '',
    ingredients: [{ product: AVEIA, quantity: '20', unit: 'g', optional: true }],
  });
});
