/**
 * Testes do armazenamento da sessão: sem "lembrar de mim", o token não chega
 * ao disco (decisão 5, minimização).
 */

import * as SecureStore from 'expo-secure-store';

import {
  clearNotificationPreferences,
  clearToken,
  readRecipeUpdatesPreference,
  readRememberMe,
  readShoppingReminderPreference,
  readToken,
  saveRecipeUpdatesPreference,
  saveShoppingReminderPreference,
  saveToken,
} from '../session';

jest.mock('expo-secure-store', () => {
  const disco = new Map<string, string>();
  return {
    disco,
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      disco.set(chave, valor);
    }),
    getItemAsync: jest.fn(async (chave: string) => disco.get(chave) ?? null),
    deleteItemAsync: jest.fn(async (chave: string) => {
      disco.delete(chave);
    }),
  };
});

const { disco } = jest.requireMock('expo-secure-store') as { disco: Map<string, string> };

beforeEach(async () => {
  await clearToken();
  disco.delete('decada.shopping_reminders');
  disco.delete('decada.recipe_updates');
  jest.clearAllMocks();
});

it('sem lembrar, o token fica só em memória', async () => {
  await saveToken('token-da-sessao', false);

  expect(await readToken()).toBe('token-da-sessao');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(disco.size).toBe(0);
  expect(await readRememberMe()).toBe(false);
});

it('sem lembrar, apaga o token que um login lembrado deixou no disco', async () => {
  await saveToken('token-antigo', true);
  await saveToken('token-novo', false);

  expect(disco.size).toBe(0);
  expect(await readToken()).toBe('token-novo');
});

it('com lembrar, o token e a preferência vão para o armazenamento seguro', async () => {
  await saveToken('token-lembrado', true);

  expect(disco.get('decada.access_token')).toBe('token-lembrado');
  expect(await readRememberMe()).toBe(true);
});

it('sair apaga a memória e o disco', async () => {
  await saveToken('token-lembrado', true);
  await clearToken();

  expect(await readToken()).toBeNull();
  expect(disco.size).toBe(0);
  expect(await readRememberMe()).toBe(false);
});

it('persiste a preferência de lembrete no armazenamento seguro', async () => {
  await saveShoppingReminderPreference(true);

  expect(disco.get('decada.shopping_reminders')).toBe('1');
  expect(await readShoppingReminderPreference()).toBe(true);

  await saveShoppingReminderPreference(false);
  expect(await readShoppingReminderPreference()).toBe(false);
});

it('persiste a preferência do aviso de receitas no armazenamento seguro', async () => {
  await saveRecipeUpdatesPreference(true);

  expect(disco.get('decada.recipe_updates')).toBe('1');
  expect(await readRecipeUpdatesPreference()).toBe(true);

  await saveRecipeUpdatesPreference(false);
  expect(await readRecipeUpdatesPreference()).toBe(false);
});

it('apagar as preferências de notificação desliga os dois avisos', async () => {
  await saveShoppingReminderPreference(true);
  await saveRecipeUpdatesPreference(true);

  await clearNotificationPreferences();

  expect(await readShoppingReminderPreference()).toBe(false);
  expect(await readRecipeUpdatesPreference()).toBe(false);
});

it('o clearToken não apaga as preferências de notificação', async () => {
  // Token vencido e abertura sem "lembrar de mim" passam pelo clearToken: é a
  // mesma pessoa no mesmo celular. Só o "Sair" apaga.
  await saveShoppingReminderPreference(true);
  await saveRecipeUpdatesPreference(true);

  await clearToken();

  expect(await readShoppingReminderPreference()).toBe(true);
  expect(await readRecipeUpdatesPreference()).toBe(true);
});
