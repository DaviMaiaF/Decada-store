/**
 * Do formulário do editor de receita para o corpo que a API aceita.
 *
 * As mesmas regras do servidor, checadas antes de enviar para o erro aparecer
 * ao lado do campo e não depois de uma ida à rede. O servidor continua sendo
 * quem decide: ele também recusa produto fora do catálogo, que daqui não dá
 * para saber.
 */

import { amountToField, parseDecimal, unitOptions } from './units';
import type { MeasurementUnit, Product, Recipe, RecipeInput } from '../types/api';

export interface IngredientRow {
  product: Product;
  /** Como a pessoa digitou: "1,5". */
  quantity: string;
  unit: MeasurementUnit;
  optional: boolean;
}

export interface RecipeForm {
  name: string;
  instructions: string;
  servings: string;
  prepMinutes: string;
  ingredients: IngredientRow[];
}

export const EMPTY_FORM: RecipeForm = {
  name: '',
  instructions: '',
  servings: '',
  prepMinutes: '',
  ingredients: [],
};

/** Formulário preenchido com uma receita salva, para editar. */
export function formFromRecipe(recipe: Recipe): RecipeForm {
  return {
    name: recipe.name,
    instructions: recipe.instructions ?? '',
    servings: recipe.servings ? String(recipe.servings) : '',
    prepMinutes: recipe.prep_minutes ? String(recipe.prep_minutes) : '',
    ingredients: recipe.ingredients.map((ingredient) => ({
      product: ingredient.product,
      quantity: amountToField(ingredient.quantity),
      unit: ingredient.unit,
      optional: ingredient.optional,
    })),
  };
}

/**
 * Ingrediente novo, ainda sem quantidade.
 *
 * A unidade começa na menor da grandeza do produto (grama, mililitro), que é
 * como receita costuma medir. Quantidade não vem sugerida: na despensa a
 * embalagem é um bom palpite, numa receita não é.
 */
export function newIngredient(product: Product): IngredientRow {
  return { product, quantity: '', unit: unitOptions(product.base_unit)[0], optional: false };
}

/** Inteiro positivo opcional: "" vira nulo; "0", "2,5" ou texto, erro. */
function optionalPositiveInt(text: string, max: number): number | null | undefined {
  const limpo = text.trim();
  if (limpo === '') return null;
  if (!/^\d+$/.test(limpo)) return undefined;
  const numero = Number(limpo);
  return numero >= 1 && numero <= max ? numero : undefined;
}

export type BuildResult = { input: RecipeInput; error: null } | { input: null; error: string };

export function buildRecipeInput(form: RecipeForm): BuildResult {
  const falha = (error: string): BuildResult => ({ input: null, error });

  const name = form.name.trim();
  if (!name) return falha('dê um nome à receita');

  const servings = optionalPositiveInt(form.servings, 100);
  if (servings === undefined) return falha('o rendimento precisa ser um número inteiro, de 1 a 100');

  const prepMinutes = optionalPositiveInt(form.prepMinutes, 24 * 60);
  if (prepMinutes === undefined) return falha('o tempo de preparo precisa ser em minutos inteiros');

  if (form.ingredients.length === 0) return falha('adicione pelo menos um ingrediente');
  if (form.ingredients.every((row) => row.optional)) {
    return falha('a receita precisa de pelo menos um ingrediente obrigatório');
  }

  const ingredients: RecipeInput['ingredients'] = [];
  for (const row of form.ingredients) {
    const quantity = parseDecimal(row.quantity);
    if (quantity === null) return falha(`informe a quantidade de ${row.product.name}`);
    // A tela só oferece unidades compatíveis; isto pega o que passar por fora.
    if (!unitOptions(row.product.base_unit).includes(row.unit)) {
      return falha(`${row.product.name} não se mede em ${row.unit}`);
    }
    ingredients.push({
      product_id: row.product.id,
      quantity,
      unit: row.unit,
      optional: row.optional,
    });
  }

  return {
    input: {
      name,
      instructions: form.instructions.trim() || null,
      servings,
      prep_minutes: prepMinutes,
      ingredients,
    },
    error: null,
  };
}
