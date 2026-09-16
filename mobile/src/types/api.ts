/**
 * Contrato da API, espelhando `backend/app/schemas/`.
 *
 * Decimais chegam como **string** no JSON ("12.90"), e não como número: é o que
 * preserva a precisão de dinheiro. Eles ficam tipados como string aqui de
 * propósito, para ninguém somar preço com aritmética de ponto flutuante sem
 * perceber. Use os utilitários de `src/services/format.ts` para exibi-los.
 */

export type MeasurementUnit = 'g' | 'kg' | 'ml' | 'l' | 'unidade';
export type BaseUnit = 'kg' | 'l' | 'unidade';
export type PlanItemStatus = 'pendente' | 'confirmado' | 'nao_identificado';
export type PriceOrigin = 'nfce' | 'scraping' | 'usuario' | 'seed';
export type PriceConfidence = 'atual' | 'recente' | 'estimativa';

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  /** Corredor do mercado: hortifruti, proteinas, laticinios, mercearia. */
  category: string | null;
  base_unit: BaseUnit;
  package_size: string | null;
  package_unit: MeasurementUnit | null;
  /** Dado fictício de desenvolvimento. A tela precisa poder avisar. */
  is_fictitious: boolean;
}

export interface PlanItem {
  id: string;
  position: number;
  raw_description: string;
  quantity: string;
  unit: MeasurementUnit;
  status: PlanItemStatus;
  product_id: string | null;
  match_score: string | null;
}

export interface MealPlan {
  id: string;
  title: string | null;
  nutritionist_name: string | null;
  consent_at: string;
  consent_version: string;
  created_at: string;
  items: PlanItem[];
}

export interface DiscardedLine {
  text: string;
  reason: string;
}

export interface ImportResult {
  meal_plan: MealPlan;
  items_created: number;
  items_matched: number;
  items_unidentified: number;
  discarded: DiscardedLine[];
}

export interface Candidate {
  product: Product;
  score: string;
  unit_compatible: boolean;
  quantity_in_base: string | null;
  packages_needed: number | null;
}

export interface ShoppingListItem {
  id: string;
  product: Product;
  /** Já descontado o que havia na despensa. Zero significa dispensado. */
  quantity: string;
  unit: MeasurementUnit;
  quantity_from_pantry: string;
  dispensed_by_pantry: boolean;
  packages_needed: number | null;
  match_score: string | null;
  estimated_cost: string | null;
  unit_price_snapshot: string | null;
  price_reference_date: string | null;
  price_origin: PriceOrigin | null;
  price_confidence: PriceConfidence | null;
  price_sample_size: number | null;
  /** Se a pessoa já pegou o item na prateleira. */
  purchased: boolean;
  /** Quando marcou. Nulo enquanto não comprou. */
  purchased_at: string | null;
}

export interface ShoppingList {
  id: string;
  meal_plan_id: string;
  state_code: string;
  city: string;
  estimated_total: string | null;
  calculated_at: string | null;
  items: ShoppingListItem[];
}

export interface GeneratedList {
  shopping_list: ShoppingList;
  items_to_buy: number;
  items_dispensed: number;
  items_skipped: number;
  items_priced: number;
  items_without_price: number;
  lowest_confidence: PriceConfidence | null;
}

export interface ProductSuggestion {
  product: Product;
  /** Semelhança de nome, de 0 a 1. */
  score: string;
}

export interface PantryItem {
  id: string;
  raw_description: string;
  product: Product | null;
  quantity: string | null;
  unit: MeasurementUnit | null;
}

export interface Account {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface RecipeIngredient {
  product: Product;
  quantity: string;
  unit: MeasurementUnit;
  optional: boolean;
}

export interface Recipe {
  id: string;
  slug: string;
  name: string;
  servings: number | null;
  prep_minutes: number | null;
  instructions: string | null;
  is_fictitious: boolean;
  ingredients: RecipeIngredient[];
}

export interface RecipeAvailability {
  recipe: Recipe;
  /** Proporção de ingredientes obrigatórios disponíveis, de 0 a 100. */
  percentage: number;
  complete: boolean;
  required_total: number;
  required_available: number;
  /** Obrigatórios que faltam — é o "falta chia" da tela. */
  missing: RecipeIngredient[];
  missing_optional: RecipeIngredient[];
}
