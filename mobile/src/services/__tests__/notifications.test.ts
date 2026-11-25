import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  buildShoppingReminderText,
  cancelShoppingReminders,
  notifyRecipesUpdated,
  requestNotificationPermission,
  scheduleShoppingReminder,
} from '../notifications';
import type { ShoppingList, ShoppingListItem } from '../../types/api';

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
}));

function shoppingListItem(over: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: 'item-1',
    product: {
      id: 'produto-1',
      name: 'Peito de frango',
      brand: null,
      category: 'proteinas',
      base_unit: 'kg',
      package_size: null,
      package_unit: null,
      is_fictitious: false,
    },
    quantity: '1.000',
    unit: 'kg',
    quantity_from_pantry: '0.000',
    dispensed_by_pantry: false,
    packages_needed: null,
    match_score: null,
    estimated_cost: '148.90',
    unit_price_snapshot: '148.90',
    price_reference_date: null,
    price_origin: null,
    price_confidence: null,
    price_sample_size: null,
    purchased: false,
    purchased_at: null,
    pantry_savings: '0.00',
    pantry_unmeasured: false,
    is_extra: false,
    ...over,
  };
}

function shoppingList(over: Partial<ShoppingList> = {}): ShoppingList {
  return {
    id: 'lista-1',
    meal_plan_id: 'plano-1',
    state_code: 'DF',
    city: 'Brasília',
    estimated_total: '148.90',
    calculated_at: null,
    items: Array.from({ length: 12 }, (_, index) => shoppingListItem({ id: `item-${index}` })),
    outdated_items: [],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'android';
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
});

it('monta o lembrete com a quantidade a comprar e o total estimado', () => {
  expect(buildShoppingReminderText(shoppingList())).toBe(
    'Sua lista de compras está pronta: 12 itens, R$ 148,90 estimados.',
  );
});

it('não inclui nomes de alimentos na mensagem', () => {
  const text = buildShoppingReminderText(
    shoppingList({
      items: [
        shoppingListItem(),
        shoppingListItem({
          id: 'item-2',
          product: { ...shoppingListItem().product, name: 'Arroz' },
        }),
      ],
    }),
  );

  expect(text).not.toContain('Peito de frango');
  expect(text).not.toContain('Arroz');
});

it('omite o valor quando a lista não tem estimativa', () => {
  expect(buildShoppingReminderText(shoppingList({ estimated_total: null }))).toBe(
    'Sua lista de compras está pronta: 12 itens, sem estimativa de preço.',
  );
});

it('cria o canal antes de pedir permissão e informa quando ela é negada', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

  await expect(requestNotificationPermission()).resolves.toBe(false);

  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'lembretes-de-compras',
    expect.objectContaining({ name: 'Lembretes de compras' }),
  );
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
});

it('não agenda se a permissão deixou de estar concedida', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

  await expect(scheduleShoppingReminder(shoppingList())).resolves.toBe(false);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('cancela só os lembretes próprios antes de agendar outro com atraso curto', async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    {
      identifier: 'lembrete-antigo',
      content: { data: { feature: 'decada.shopping-list-ready' } },
    },
    { identifier: 'outro-recurso', content: { data: { feature: 'outro' } } },
  ]);

  await expect(scheduleShoppingReminder(shoppingList())).resolves.toBe(true);

  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('lembrete-antigo');
  expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('outro-recurso');
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      content: expect.objectContaining({ body: expect.stringContaining('12 itens') }),
      trigger: expect.objectContaining({
        type: 'timeInterval',
        seconds: 5,
        channelId: 'lembretes-de-compras',
      }),
    }),
  );
});

it('cancelarLembretes preserva notificações de outras funcionalidades', async () => {
  (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
    {
      identifier: 'lembrete-pendente',
      content: { data: { feature: 'decada.shopping-list-ready' } },
    },
    { identifier: 'outro-recurso', content: { data: { feature: 'outro' } } },
  ]);

  await cancelShoppingReminders();

  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('lembrete-pendente');
});

it('avisa na hora, no canal das receitas, que as receitas foram atualizadas', async () => {
  await expect(notifyRecipesUpdated()).resolves.toBe(true);

  expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'receitas',
    expect.objectContaining({ name: 'Receitas' }),
  );
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    content: {
      title: 'Receitas atualizadas',
      body: 'Suas opções de receitas foram atualizadas.',
      data: { feature: 'decada.recipes-updated' },
    },
    trigger: { channelId: 'receitas' },
  });
});

it('não avisa das receitas sem permissão', async () => {
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

  await expect(notifyRecipesUpdated()).resolves.toBe(false);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

it('fora do Android não cria canal, mas avisa', async () => {
  (Platform as { OS: string }).OS = 'ios';

  await expect(notifyRecipesUpdated()).resolves.toBe(true);
  expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
});
