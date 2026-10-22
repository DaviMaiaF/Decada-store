/**
 * Testes do armazenamento da sessão: sem "lembrar de mim", o token não chega
 * ao disco (decisão 5, minimização).
 */

import * as SecureStore from 'expo-secure-store';

import { clearToken, readRememberMe, readToken, saveToken } from '../session';

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
