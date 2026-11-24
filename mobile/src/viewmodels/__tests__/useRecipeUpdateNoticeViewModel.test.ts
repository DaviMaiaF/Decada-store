import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as notifications from '../../services/notifications';
import * as session from '../../services/session';
import { useRecipeUpdateNoticeViewModel } from '../useRecipeUpdateNoticeViewModel';

jest.mock('../../services/notifications', () => ({
  notifyRecipesUpdated: jest.fn(),
  requestNotificationPermission: jest.fn(),
}));

jest.mock('../../services/session', () => ({
  readRecipeUpdatesPreference: jest.fn(),
  saveRecipeUpdatesPreference: jest.fn(),
}));

const readPreference = session.readRecipeUpdatesPreference as jest.Mock;
const savePreference = session.saveRecipeUpdatesPreference as jest.Mock;
const requestPermission = notifications.requestNotificationPermission as jest.Mock;
const notify = notifications.notifyRecipesUpdated as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  readPreference.mockResolvedValue(false);
  savePreference.mockResolvedValue(undefined);
  requestPermission.mockResolvedValue(true);
  notify.mockResolvedValue(true);
});

async function montar() {
  const hook = await renderHook(() => useRecipeUpdateNoticeViewModel());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

it('começa desligado quando não há preferência salva', async () => {
  const { result } = await montar();

  expect(result.current.enabled).toBe(false);
});

it('recupera a preferência salva', async () => {
  readPreference.mockResolvedValue(true);

  const { result } = await montar();

  expect(result.current.enabled).toBe(true);
});

it('ligar pede a permissão e salva a preferência', async () => {
  const { result } = await montar();

  await act(async () => result.current.setNoticeEnabled(true));

  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(savePreference).toHaveBeenCalledWith(true);
  expect(result.current.enabled).toBe(true);
});

it('não liga se a permissão for negada', async () => {
  requestPermission.mockResolvedValue(false);
  const { result } = await montar();

  await act(async () => result.current.setNoticeEnabled(true));

  expect(savePreference).not.toHaveBeenCalled();
  expect(result.current.enabled).toBe(false);
  expect(result.current.error).toMatch(/permissão de notificações/);
});

it('desligar salva sem pedir permissão', async () => {
  readPreference.mockResolvedValue(true);
  const { result } = await montar();

  await act(async () => result.current.setNoticeEnabled(false));

  expect(requestPermission).not.toHaveBeenCalled();
  expect(savePreference).toHaveBeenCalledWith(false);
  expect(result.current.enabled).toBe(false);
});

it('avisa quando as receitas mudam e a chave está ligada', async () => {
  readPreference.mockResolvedValue(true);
  const { result } = await montar();

  await act(async () => result.current.onRecipesUpdated());

  expect(notify).toHaveBeenCalledTimes(1);
  expect(result.current.error).toBeNull();
});

it('não avisa com a chave desligada', async () => {
  const { result } = await montar();

  await act(async () => result.current.onRecipesUpdated());

  expect(notify).not.toHaveBeenCalled();
});

it('explica quando a permissão foi removida depois de ligar', async () => {
  readPreference.mockResolvedValue(true);
  notify.mockResolvedValue(false);
  const { result } = await montar();

  await act(async () => result.current.onRecipesUpdated());

  expect(result.current.error).toMatch(/permissão de notificações foi removida/);
});
