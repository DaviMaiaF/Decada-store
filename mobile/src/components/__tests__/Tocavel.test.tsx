/** Testes da área tocável. */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { Tocavel } from '../Tocavel';
import { motion } from '../../theme/motion';

// O driver nativo não roda no Jest: o valor animado não anda sozinho. Os testes
// conferem o pedido de animação que o toque faz.
let timing: jest.SpyInstance;

beforeEach(() => {
  timing = jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function montar(props: Partial<React.ComponentProps<typeof Tocavel>> = {}) {
  await render(
    <Tocavel accessibilityRole="button" {...props}>
      <Text>Tocar</Text>
    </Tocavel>,
  );
  return screen.getByRole('button');
}

it('o toque chega a quem chamou', async () => {
  const onPress = jest.fn();
  const botao = await montar({ onPress });

  await fireEvent.press(botao);

  expect(onPress).toHaveBeenCalledTimes(1);
});

it('encolhe ao pressionar e volta ao soltar, na curva padrão', async () => {
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();
  const botao = await montar({ onPressIn, onPressOut });

  await fireEvent(botao, 'pressIn');
  await fireEvent(botao, 'pressOut');

  const pedidos = timing.mock.calls.map(([, config]) => config);
  expect(pedidos).toEqual([
    expect.objectContaining({
      toValue: motion.pressedScale,
      duration: motion.duration.press,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }),
    expect.objectContaining({ toValue: 1 }),
  ]);
  // Quem passou os próprios handlers continua recebendo.
  expect(onPressIn).toHaveBeenCalledTimes(1);
  expect(onPressOut).toHaveBeenCalledTimes(1);
});

it('começa no tamanho normal', async () => {
  const botao = await montar();

  expect(botao).toHaveStyle({ transform: [{ scale: 1 }] });
});
