/** Testes da entrada suave. */

import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';

import { Entrada } from '../Entrada';
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
