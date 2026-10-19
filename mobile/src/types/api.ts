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
/** Um papel por conta: quem segue um plano ou quem escreve receitas. */
export type UserRole = 'paciente' | 'nutricionista';

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
  /** Produto escolhido; nulo até a confirmação. É o que a tela mostra depois
   * de confirmar ou editar. */
  product: Product | null;
  match_score: string | null;
}

export interface MealPlan {
  id: string;
  title: string | null;
  nutritionist_name: string | null;
  nutritionist_crn: string | null;
  consent_at: string;
  consent_version: string;
  created_at: string;
  items: PlanItem[];
  /** Refeições, substituições e orientação do plano montado pela nutricionista
   * no app. Só para ler: a compra sai de `items`. Nulo no plano vindo de PDF. */
  prescribed_meals: PrescribedPlan | null;
}

/** Plano na listagem: sem os itens, que vêm por `readMealPlan`. */
export interface MealPlanSummary {
  id: string;
  title: string | null;
  nutritionist_name: string | null;
  nutritionist_crn: string | null;
  consent_at: string;
  created_at: string;
  item_count: number;
  confirmed_count: number;
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
  /** O que a despensa poupou neste item. Nulo quando não há preço. */
  pantry_savings: string | null;
  /**
   * Item que a pessoa acrescentou, e não veio do plano alimentar.
   *
   * É o que diz à tela que este pode sair da lista: item prescrito, não —
   * o app compara o preço do que a nutricionista pediu, nunca decide que
   * a pessoa não deve levar um alimento.
   */
  is_extra: boolean;
}

/** Por que um item do plano não bate mais com a lista já gerada. */
export type PlanChange = 'produto_trocado' | 'nao_confirmado' | 'novo_confirmado';

/** Item do plano que mudou depois de a lista ser gerada. */
export interface OutdatedItem {
  plan_item_id: string;
  description: string;
  change: PlanChange;
}

export interface ShoppingList {
  id: string;
  meal_plan_id: string;
  state_code: string;
  city: string;
  estimated_total: string | null;
  calculated_at: string | null;
  items: ShoppingListItem[];
  /** Vazio é lista em dia; cheio, a tela avisa e oferece gerar de novo. */
  outdated_items: OutdatedItem[];
}

/** Um item da lista sob uma quantidade hipotética. Nada disso foi gravado. */
export interface SimulatedItem {
  item_id: string;
  quantity: string;
  quantity_charged: string;
  packages_needed: number | null;
  estimated_cost: string | null;
}

/** Lista na listagem: sem os itens, que vêm por `readShoppingList`. */
export interface ShoppingListSummary {
  id: string;
  meal_plan_id: string;
  state_code: string;
  city: string;
  estimated_total: string | null;
  calculated_at: string | null;
  created_at: string;
}

export interface GeneratedList {
  shopping_list: ShoppingList;
  items_to_buy: number;
  items_dispensed: number;
  items_skipped: number;
  items_priced: number;
  items_without_price: number;
  pantry_savings: string;
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
  role: UserRole;
  /** Só a nutricionista tem. */
  crn: string | null;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  /** Diz qual navegação abrir, sem uma ida extra a `/auth/me`. */
  role: UserRole;
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

// --- plano montado pela nutricionista ---

export type PrescriptionStatus = 'rascunho' | 'enviada' | 'aceita' | 'recusada';

export interface PrescriptionItem {
  food: string;
  /** "6 colheres de sopa": como se mede em casa. Informativo. */
  household_measure: string | null;
  /** Quantidade de compra, que vira item do plano do paciente. */
  quantity: string;
  unit: MeasurementUnit;
}

export interface PrescriptionMeal {
  name: string;
  /** "08:30" ou "08:30:00", conforme a origem. */
  time: string;
  notes: string | null;
  /** O que se come: vai para a lista de compras. */
  items: PrescriptionItem[];
  /** Cada opção substitui a refeição inteira. Só para ler. */
  substitutions: PrescriptionItem[][];
}

export interface PrescribedPlan {
  notes: string | null;
  meals: PrescriptionMeal[];
}

export interface Prescription {
  id: string;
  title: string | null;
  patient_name: string | null;
  patient_email: string | null;
  notes: string | null;
  status: PrescriptionStatus;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  meals: PrescriptionMeal[];
}

export interface PrescriptionSummary {
  id: string;
  title: string | null;
  patient_name: string | null;
  patient_email: string | null;
  status: PrescriptionStatus;
  sent_at: string | null;
  updated_at: string;
  meal_count: number;
}

/** O plano como a nutricionista o envia. Serve para criar e para editar. */
export interface PrescriptionInput {
  title: string | null;
  patient_name: string | null;
  notes: string | null;
  meals: {
    name: string;
    time: string;
    notes: string | null;
    items: PrescriptionItem[];
    substitutions: PrescriptionItem[][];
  }[];
}

/** Plano que a nutricionista enviou ao paciente, esperando resposta. */
export interface ReceivedPrescription {
  id: string;
  title: string | null;
  notes: string | null;
  sent_at: string | null;
  author: { full_name: string | null; crn: string | null };
  meals: PrescriptionMeal[];
}
