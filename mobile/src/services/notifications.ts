import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { formatMoney } from './format';
import type { ShoppingList } from '../types/api';

const REMINDER_CHANNEL = 'lembretes-de-compras';
const REMINDER_MARKER = 'decada.shopping-list-ready';
// Canal próprio: a pessoa pode silenciar um tipo de aviso sem perder o outro.
const RECIPE_CHANNEL = 'receitas';
const RECIPE_MARKER = 'decada.recipes-updated';

export const RECIPE_UPDATE_TITLE = 'Receitas atualizadas';
// Sem nome de alimento: a notificação aparece na tela bloqueada (decisão 5).
export const RECIPE_UPDATE_TEXT = 'Suas opções de receitas foram atualizadas.';
const REMINDER_DELAY_SECONDS = 5;

let handlerConfigured = false;

function configureNotificationHandler(): void {
  if (handlerConfigured) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  handlerConfigured = true;
}

export function buildShoppingReminderText(shoppingList: ShoppingList): string {
  const itemCount = shoppingList.items.filter((item) => !item.dispensed_by_pantry).length;
  const items = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;

  if (shoppingList.estimated_total === null) {
    return `Sua lista de compras está pronta: ${items}, sem estimativa de preço.`;
  }

  return `Sua lista de compras está pronta: ${items}, ${formatMoney(shoppingList.estimated_total)} estimados.`;
}

async function configureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
    name: 'Lembretes de compras',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1B4332',
  });
  await Notifications.setNotificationChannelAsync(RECIPE_CHANNEL, {
    name: 'Receitas',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1B4332',
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  configureNotificationHandler();
  await configureChannels();

  const currentPermission = await Notifications.getPermissionsAsync();
  if (currentPermission.status === 'granted') return true;

  const requestedPermission = await Notifications.requestPermissionsAsync();
  return requestedPermission.status === 'granted';
}

export async function cancelShoppingReminders(): Promise<void> {
  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const shoppingReminders = scheduledNotifications.filter(
    (notification) => notification.content.data?.feature === REMINDER_MARKER,
  );

  await Promise.all(
    shoppingReminders.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
}

export async function scheduleShoppingReminder(shoppingList: ShoppingList): Promise<boolean> {
  configureNotificationHandler();
  await configureChannels();

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  await cancelShoppingReminders();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Lista de compras pronta',
      body: buildShoppingReminderText(shoppingList),
      data: { feature: REMINDER_MARKER },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: REMINDER_DELAY_SECONDS,
      channelId: REMINDER_CHANNEL,
    },
  });

  return true;
}

/**
 * Avisa que as receitas sugeridas mudaram, logo depois de recalculadas a partir
 * do que a foto da despensa trouxe. Sai na hora, no canal das receitas. Sem
 * permissão não avisa e devolve falso.
 */
export async function notifyRecipesUpdated(): Promise<boolean> {
  configureNotificationHandler();
  await configureChannels();

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: RECIPE_UPDATE_TITLE,
      body: RECIPE_UPDATE_TEXT,
      data: { feature: RECIPE_MARKER },
    },
    // Só o canal, sem horário: a notificação sai imediatamente.
    trigger: { channelId: RECIPE_CHANNEL },
  });

  return true;
}
