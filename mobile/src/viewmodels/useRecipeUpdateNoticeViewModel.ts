/**
 * ViewModel do aviso "Suas opções de receitas foram atualizadas".
 *
 * O aviso é opcional e começa desligado: a chave fica na aba Despensa e pede a
 * permissão do sistema só quando a pessoa liga. Depois disso, cada rodada de
 * confirmações da foto da despensa termina com um aviso, quando as receitas
 * acabam de ser recalculadas.
 */

import { useEffect, useState } from 'react';

import { notifyRecipesUpdated, requestNotificationPermission } from '../services/notifications';
import { readRecipeUpdatesPreference, saveRecipeUpdatesPreference } from '../services/session';

export function useRecipeUpdateNoticeViewModel() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    readRecipeUpdatesPreference()
      .then((preference) => {
        if (active) setEnabled(preference);
      })
      .catch(() => {
        if (active) setError('não foi possível carregar a preferência do aviso de receitas');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function setNoticeEnabled(value: boolean): Promise<void> {
    if (loading || saving || value === enabled) return;

    setError(null);
    setSaving(true);
    try {
      if (value && !(await requestNotificationPermission())) {
        setError('A permissão de notificações é necessária para avisar sobre as receitas.');
        return;
      }

      await saveRecipeUpdatesPreference(value);
      setEnabled(value);
    } catch {
      setError('não foi possível atualizar a preferência do aviso de receitas');
    } finally {
      setSaving(false);
    }
  }

  /** As receitas acabaram de ser recalculadas com o que veio da foto. */
  async function onRecipesUpdated(): Promise<void> {
    try {
      // Lê do armazenamento, e não do estado: a chave pode ter mudado no meio.
      if (!(await readRecipeUpdatesPreference())) return;

      if (!(await notifyRecipesUpdated())) {
        setError('A permissão de notificações foi removida; ative o aviso novamente.');
      }
    } catch {
      setError('não foi possível avisar sobre as receitas');
    }
  }

  return {
    enabled,
    loading,
    saving,
    error,
    setNoticeEnabled,
    onRecipesUpdated,
  };
}
