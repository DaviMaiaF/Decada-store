/**
 * Configuração compartilhada dos testes.
 *
 * O TanStack Query agrupa as notificações de mudança num temporizador. Isso é
 * bom em produção e ruim no teste: o temporizador sobrevive ao fim da suíte e
 * o Jest não encerra sozinho. Aqui as notificações passam a ser síncronas.
 */

import { notifyManager } from '@tanstack/react-query';

notifyManager.setScheduler((callback) => callback());
