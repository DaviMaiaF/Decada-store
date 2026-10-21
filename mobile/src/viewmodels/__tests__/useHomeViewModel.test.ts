/** Testes do ViewModel da tela de início. */

import { renderHook } from '@testing-library/react-native';

import { useHomeViewModel } from '../useHomeViewModel';

function jornada(cumpridas: boolean[]) {
  return ['Enviar', 'Confirmar', 'Região', 'Comprar'].map((rotulo, i) => ({
    rotulo,
    cumprida: cumpridas[i],
  }));
}

it('no meio da jornada, devolve a etapa atual e não a conclusão', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, false, false, false])));

  expect(result.current.passo.botao).toBe('Confirmar produtos');
  expect(result.current.jornadaConcluida).toBe(false);
});

it('com tudo cumprido, marca a jornada como concluída', async () => {
  const { result } = await renderHook(() => useHomeViewModel(jornada([true, true, true, true])));

  expect(result.current.jornadaConcluida).toBe(true);
  expect(result.current.passo.aba).toBe('Economia');
});

it('acompanha a trilha quando ela muda', async () => {
  const { result, rerender } = await renderHook(
    ({ cumpridas }: { cumpridas: boolean[] }) => useHomeViewModel(jornada(cumpridas)),
    { initialProps: { cumpridas: [false, false, false, false] } },
  );
  expect(result.current.passo.aba).toBe('Dieta');

  await rerender({ cumpridas: [true, true, false, false] });

  expect(result.current.passo.aba).toBe('Mercado');
});
