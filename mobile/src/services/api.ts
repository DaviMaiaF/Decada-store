/**
 * Cliente HTTP da API da DÉCADA.
 *
 * Uma função só monta toda requisição: assim o token entra em um lugar, e o
 * tratamento de erro do servidor vira sempre o mesmo tipo de exceção.
 */

import { Platform } from 'react-native';

import { API_URL } from './config';
import { readToken } from './session';
import type {
  Account,
  Candidate,
  GeneratedList,
  ImportResult,
  MealPlan,
  PantryItem,
  PlanItem,
  ProductSuggestion,
  RecipeAvailability,
  ShoppingList,
  ShoppingListItem,
  Token,
} from '../types/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Sessão expirada, token adulterado ou conta excluída. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** Mensagem legível a partir do corpo de erro da API. */
function readDetail(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Erro de validação do Pydantic: lista de problemas por campo.
    if (Array.isArray(detail) && detail.length > 0) {
      const primeiro = detail[0] as { msg?: string };
      if (primeiro?.msg) return primeiro.msg;
    }
  }
  return fallback;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Requisição de login e cadastro, que ainda não tem token. */
  anonymous?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = await readToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Falha de rede não tem status HTTP; 0 marca esse caso.
    throw new ApiError(0, 'não foi possível falar com o servidor');
  }

  if (resposta.status === 204) return undefined as T;

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    throw new ApiError(resposta.status, readDetail(corpo, 'erro inesperado no servidor'));
  }

  return corpo as T;
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
 * Envia o PDF. Vai como multipart, e não JSON, então monta a requisição à mão
 * em vez de passar por `request`.
 */
export async function importMealPlan(
  file: { uri: string; name: string; mimeType?: string },
  consentAccepted: boolean,
  extras: { title?: string; nutritionistName?: string } = {},
): Promise<ImportResult> {
  const token = await readToken();
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

  let resposta: Response;
  try {
    resposta = await fetch(`${API_URL}/meal-plans`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, 'não foi possível enviar o arquivo');
  }

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    throw new ApiError(resposta.status, readDetail(corpo, 'não foi possível ler o PDF'));
  }

  return corpo as ImportResult;
}

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

export const readShoppingList = (listId: string) =>
  request<ShoppingList>(`/shopping-lists/${listId}`);

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