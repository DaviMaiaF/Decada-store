import { act, renderHook, waitFor } from '@testing-library/react-native';

import * as notifications from '../../services/notifications';
import * as session from '../../services/session';
import type { ShoppingList } from '../../types/api';
import { useShoppingReminderViewModel } from '../useShoppingReminderViewModel';

jest.mock('../../services/notifications', () => ({
  cancelShoppingReminders: jest.fn(),
  requestNotificationPermission: jest.fn(),
  scheduleShoppingReminder: jest.fn(),
}));

jest.mock('../../services/session', () => ({
  readShoppingReminderPreference: jest.fn(),
  saveShoppingReminderPreference: jest.fn(),
}));

const readPreference = session.readShoppingReminderPreference as jest.Mock;
const savePreference = session.saveShoppingReminderPreference as jest.Mock;
const requestPermission = notifications.requestNotificationPermission as jest.Mock;
const scheduleReminder = notifications.scheduleShoppingReminder as jest.Mock;
const cancelReminders = notifications.cancelShoppingReminders as jest.Mock;

const SHOPPING_LIST: ShoppingList = {
  id: 'lista-1',
  meal_plan_id: 'plano-1',
  state_code: 'DF',
  city: 'Brasília',
  estimated_total: '148.90',
  calculated_at: null,
  items: [],
  outdated_items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  readPreference.mockResolvedValue(false);
  savePreference.mockResolvedValue(undefined);
  requestPermission.mockResolvedValue(true);
  scheduleReminder.mockResolvedValue(true);
  cancelReminders.mockResolvedValue(undefined);
});

it('recupera a preferência salva ao abrir o ViewModel', async () => {
  readPreference.mockResolvedValue(true);

  const { result } = await renderHook(() => useShoppingReminderViewModel());

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.enabled).toBe(true);
});

it('não persiste a preferência se a permissão for negada', async () => {
  requestPermission.mockResolvedValue(false);
  const { result } = await renderHook(() => useShoppingReminderViewModel());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => result.current.setReminderEnabled(true));

  expect(result.current.enabled).toBe(false);
  expect(result.current.error).toBe(
    'A permissão de notificações é necessária para lembrar de comprar.',
  );
  expect(savePreference).not.toHaveBeenCalled();
});

it('pede permissão antes de salvar a preferência ativada', async () => {
  const { result } = await renderHook(() => useShoppingReminderViewModel());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => result.current.setReminderEnabled(true));

  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(savePreference).toHaveBeenCalledWith(true);
  expect(result.current.enabled).toBe(true);
});

it('cancela os lembretes pendentes ao desativar', async () => {
  readPreference.mockResolvedValue(true);
  const { result } = await renderHook(() => useShoppingReminderViewModel());
  await waitFor(() => expect(result.current.enabled).toBe(true));

  await act(async () => result.current.setReminderEnabled(false));

  expect(cancelReminders).toHaveBeenCalledTimes(1);
  expect(savePreference).toHaveBeenCalledWith(false);
  expect(result.current.enabled).toBe(false);
});

it('integra a geração com o serviço de notificações quando a preferência está ativa', async () => {
  readPreference.mockResolvedValue(true);
  const { result } = await renderHook(() => useShoppingReminderViewModel());
  await waitFor(() => expect(result.current.enabled).toBe(true));

  await act(async () => result.current.onShoppingListGenerated(SHOPPING_LIST));

  expect(scheduleReminder).toHaveBeenCalledWith(SHOPPING_LIST);
});
