/** Testes da entrada suave. */

import { render, renderHook, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';

import { Entrada, atrasoDaCascata, useCascata } from '../Entrada';
import { motion } from '../../theme/motion';

/** A caixa animada é o pai do texto. */
function caixa() {
  return screen.getByText('conteúdo').parent!;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// O driver nativo não roda no Jest: o valor animado não anda sozinho. Os testes
// conferem o ponto de partida e o pedido de animação que a entrada faz.
it('começa invisível e um pouco abaixo, e anima até o lugar na curva padrão', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');

  await render(
    <Entrada atraso={120}>
      <Text>conteúdo</Text>
    </Entrada>,
  );

  expect(caixa()).toHaveStyle({ opacity: 0, transform: [{ translateY: motion.distance.enter }] });
  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing.mock.calls[0][1]).toMatchObject({
    toValue: 1,
    delay: 120,
    duration: motion.duration.enter,
    easing: motion.easing.standard,
    useNativeDriver: true,
  });
});

it('com movimento reduzido, o conteúdo já aparece no lugar', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const timing = jest.spyOn(Animated, 'timing');

  await render(
    <Entrada>
      <Text>conteúdo</Text>
    </Entrada>,
  );

  expect(caixa()).toHaveStyle({ opacity: 1, transform: [{ translateY: 0 }] });
  expect(timing).not.toHaveBeenCalled();
});

it('mudar o atraso depois de montar não recomeça a entrada', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');

  const { rerender } = await render(
    <Entrada atraso={120}>
      <Text>conteúdo</Text>
    </Entrada>,
  );
  await rerender(
    <Entrada atraso={0}>
      <Text>conteúdo</Text>
    </Entrada>,
  );

  expect(timing).toHaveBeenCalledTimes(1);
  expect(timing.mock.calls[0][1]).toMatchObject({ delay: 120 });
});

it('a cascata cresce um passo por item e para no limite', () => {
  expect(atrasoDaCascata(0)).toBe(0);
  expect(atrasoDaCascata(3)).toBe(motion.duration.stagger * 3);
  expect(atrasoDaCascata(8)).toBe(atrasoDaCascata(50));
});

it('a cascata vale só na primeira vez que a lista aparece com conteúdo', async () => {
  const { result, rerender } = await renderHook(({ pronta }: { pronta: boolean }) => useCascata(pronta), {
    initialProps: { pronta: false },
  });

  // Ainda carregando: a cascata continua de pé para quando o conteúdo chegar.
  await rerender({ pronta: false });
  expect(result.current(2)).toBe(atrasoDaCascata(2));

  // Primeira renderização com conteúdo: em cascata.
  await rerender({ pronta: true });
  expect(result.current(2)).toBe(atrasoDaCascata(2));

  // Dali em diante, item novo entra na hora.
  await rerender({ pronta: true });
  expect(result.current(2)).toBe(0);
});
