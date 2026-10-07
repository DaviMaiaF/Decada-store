/**
 * Cliente HTTP da API da DÉCADA.
 *
 * Cada função daqui é um endpoint do backend, e nada mais: autenticação, tempo
 * limite e tradução de erro ficam na instância do axios, em `http.ts`.
 */

import { Platform } from 'react-native';

import { http } from './http';
import type {
  Account,
  Candidate,
  GeneratedList,
  ImportResult,
  MealPlan,
  MealPlanSummary,
  MeasurementUnit,
  PantryItem,
  PlanItem,
  ProductSuggestion,
  RecipeAvailability,
  ShoppingList,
  ShoppingListItem,
  ShoppingListSummary,
  SimulatedItem,
  Token,
} from '../types/api';

export { ApiError } from './http';

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Requisição de login e cadastro, que ainda não tem token. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;

  const resposta = await http.request<T>({ url: path, method, data: body, anonymous });

  // O 204 do DELETE não tem corpo; o axios devolve string vazia nesse caso.
  if (resposta.status === 204) return undefined as T;

  return resposta.data;
}

// --- conta ---

export const register = (email: string, password: string, fullName?: string) =>
  request<Token>('/auth/register', {
    method: 'POST',
    anonymous: true,
    body: { email, password, full_name: fullName ?? null },
  });

export const login = (email: string, password: string) =>
  request<Token>('/auth/login', { method: 'POST', anonymous: true, body: { email, password } });

export const readAccount = () => request<Account>('/auth/me');

export const deleteAccount = () => request<unknown>('/auth/me', { method: 'DELETE' });

// --- plano alimentar ---

/**
 * Envia o PDF. Vai como multipart, e não JSON, então não passa por `request`.
 * O token continua vindo do interceptor, como em qualquer outra chamada.
 */
export async function importMealPlan(
  file: { uri: string; name: string; mimeType?: string },
  consentAccepted: boolean,
  extras: { title?: string; nutritionistName?: string } = {},
): Promise<ImportResult> {
  const form = new FormData();

  if (Platform.OS === 'web') {
    // No navegador, FormData converte objeto qualquer em "[object Object]" e o
    // servidor recebe texto onde esperava arquivo. Aqui o conteúdo precisa ser
    // lido de verdade e enviado como Blob.
    const conteudo = await fetch(file.uri).then((resposta) => resposta.blob());
    form.append('file', conteudo, file.name);
  } else {
    // No React Native, este objeto é o formato de arquivo que o FormData aceita.
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? 'application/pdf',
    } as unknown as Blob);
  }
  form.append('consent_accepted', String(consentAccepted));
  if (extras.title) form.append('title', extras.title);
  if (extras.nutritionistName) form.append('nutritionist_name', extras.nutritionistName);

  const resposta = await http.post<ImportResult>('/meal-plans', form, {
    networkMessage: 'não foi possível enviar o arquivo',
    fallbackMessage: 'não foi possível ler o PDF',
    // Subir arquivo em rede de celular passa do tempo limite das outras chamadas.
    timeout: 60_000,
  });

  return resposta.data;
}

/** Planos do usuário, do mais recente ao mais antigo. */
export const readMealPlans = () => request<MealPlanSummary[]>('/meal-plans');

export const readMealPlan = (planId: string) => request<MealPlan>(`/meal-plans/${planId}`);

export const readCandidates = (planId: string, itemId: string) =>
  request<Candidate[]>(`/meal-plans/${planId}/items/${itemId}/candidates`);

export const confirmItem = (
  planId: string,
  itemId: string,
  productId: string,
  matchScore: string | null,
) =>
  request<PlanItem>(`/meal-plans/${planId}/items/${itemId}/confirmation`, {
    method: 'POST',
    body: { product_id: productId, match_score: matchScore },
  });

// --- lista de compras ---

export const generateShoppingList = (planId: string, stateCode: string, city: string) =>
  request<GeneratedList>(`/meal-plans/${planId}/shopping-lists`, {
    method: 'POST',
    body: { state_code: stateCode, city },
  });

/** Listas já geradas para o plano, da mais recente à mais antiga. */
export const readShoppingLists = (planId: string) =>
  request<ShoppingListSummary[]>(`/meal-plans/${planId}/shopping-lists`);

export const readShoppingList = (listId: string) =>
  request<ShoppingList>(`/shopping-lists/${listId}`);

/**
 * Quanto custaria a lista com outras quantidades. Não grava nada.
 *
 * A conta é do servidor porque produto embalado sobe de pacote em pacote:
 * multiplicar preço por quantidade aqui sairia errado para tudo que vem embalado.
 */
export const simulateShoppingList = (
  listId: string,
  items: { item_id: string; quantity: string }[],
) =>
  request<SimulatedItem[]>(`/shopping-lists/${listId}/simulation`, {
    method: 'POST',
    body: { items },
  });

/**
 * Acrescenta à compra um produto que o plano não pediu.
 *
 * O ingrediente que falta para a receita e o que acabou em casa. A prescrição
 * não muda — muda a lista de compras, que é outra coisa. Produto que já está
 * na lista devolve 409 em vez de entrar duas vezes.
 */
export const addExtraItem = (
  listId: string,
  item: { product_id: string; quantity: string; unit: MeasurementUnit },
) => request<ShoppingListItem>(`/shopping-lists/${listId}/items`, { method: 'POST', body: item });

/** Tira o item avulso da lista. Item vindo da prescrição recebe 422. */
export const removeShoppingListItem = (listId: string, itemId: string) =>
  request<void>(`/shopping-lists/${listId}/items/${itemId}`, { method: 'DELETE' });

/** Marca ou desmarca um item, dentro do mercado. */
export const setItemPurchased = (listId: string, itemId: string, purchased: boolean) =>
  request<ShoppingListItem>(`/shopping-lists/${listId}/items/${itemId}`, {
    method: 'PATCH',
    body: { purchased },
  });

// --- despensa ---

export const readPantry = () => request<PantryItem[]>('/pantry');

export const addPantryItem = (item: {
  raw_description: string;
  product_id?: string | null;
  quantity?: string | null;
  unit?: string | null;
}) => request<PantryItem>('/pantry', { method: 'POST', body: item });

export const updatePantryItem = (
  itemId: string,
  item: {
    product_id?: string | null;
    quantity?: string | null;
    unit?: string | null;
  },
) => request<PantryItem>(`/pantry/${itemId}`, { method: 'PATCH', body: item });

export const removePantryItem = (itemId: string) =>
  request<void>(`/pantry/${itemId}`, { method: 'DELETE' });

/**
 * Produtos do catálogo parecidos com um texto digitado.
 *
 * É o que permite escolher o produto antes de guardar o item na despensa —
 * item sem produto não abate da compra nem conta para as receitas.
 */
export const searchProducts = (termo: string, limit = 5) =>
  request<ProductSuggestion[]>(
    `/products/search?${new URLSearchParams({ q: termo, limit: String(limit) })}`,
  );

// --- receitas ---

/**
 * Receitas ordenadas da mais disponível para a menos.
 *
 * Sem `shoppingListId`, a disponibilidade conta só o que está na despensa
 * agora; com ele, conta também o que será comprado.
 */
export const readRecipeSuggestions = (shoppingListId?: string, minimumPercentage = 0) => {
  const parametros = new URLSearchParams({ minimum_percentage: String(minimumPercentage) });
  if (shoppingListId) parametros.set('shopping_list_id', shoppingListId);
  return request<RecipeAvailability[]>(`/recipes/suggestions?${parametros.toString()}`);
};
