import { useEffect, useState } from 'react';

import {
  cancelShoppingReminders,
  requestNotificationPermission,
  scheduleShoppingReminder,
} from '../services/notifications';
import {
  readShoppingReminderPreference,
  saveShoppingReminderPreference,
} from '../services/session';
import type { ShoppingList } from '../types/api';

export function useShoppingReminderViewModel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    readShoppingReminderPreference()
      .then((preference) => {
        if (active) setEnabled(preference);
      })
      .catch(() => {
        if (active) setError('não foi possível carregar a preferência de lembretes');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function setReminderEnabled(value: boolean): Promise<void> {
    if (loading || saving || value === enabled) return;

    setError(null);
    setSaving(true);
    try {
      if (value && !(await requestNotificationPermission())) {
        setError('A permissão de notificações é necessária para lembrar de comprar.');
        return;
      }

      if (!value) await cancelShoppingReminders();
      await saveShoppingReminderPreference(value);
      setEnabled(value);
    } catch {
      setError('não foi possível atualizar a preferência de lembretes');
    } finally {
      setSaving(false);
    }
  }

  async function onShoppingListGenerated(shoppingList: ShoppingList): Promise<void> {
    setError(null);
    try {
      if (!(await readShoppingReminderPreference())) return;

      if (!(await scheduleShoppingReminder(shoppingList))) {
        setError('A permissão de notificações foi removida; ative o lembrete novamente.');
      }
    } catch {
      setError('não foi possível agendar o lembrete da lista de compras');
    }
  }

  return {
    enabled,
    loading,
    saving,
    error,
    setReminderEnabled,
    onShoppingListGenerated,
  };
}
