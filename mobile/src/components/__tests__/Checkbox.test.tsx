/** Testes da caixa de seleção. */

import { fireEvent, render, screen } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { Checkbox } from '../index';
import { motion } from '../../theme/motion';

// O driver nativo não roda no Jest: o valor animado não anda sozinho. Os testes
// conferem o ponto de partida e o pedido de animação.
let timing: jest.SpyInstance;

beforeEach(() => {
  timing = jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({ start: jest.fn() } as unknown as Animated.CompositeAnimation);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function pedidos() {
  return timing.mock.calls.map(([, config]) => config);
}

it('encolhe de leve ao toque, como o botão', async () => {
  await render(<Checkbox label="banana" checked={false} onPress={jest.fn()} />);

  await fireEvent(screen.getByRole('checkbox'), 'pressIn');

  expect(pedidos()).toContainEqual(expect.objectContaining({ toValue: motion.pressedScale }));
});

it('ao marcar, o ✓ cresce do zero na curva padrão', async () => {
  const { rerender } = await render(<Checkbox label="banana" checked={false} onPress={jest.fn()} />);

  await rerender(<Checkbox label="banana" checked onPress={jest.fn()} />);

  expect(screen.getByText('✓')).toHaveStyle({ transform: [{ scale: 0 }] });
  expect(pedidos()).toContainEqual(
    expect.objectContaining({
      toValue: 1,
      duration: motion.duration.short,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }),
  );
});

it('a caixa que já abre marcada mostra o ✓ parado', async () => {
  await render(<Checkbox label="banana" checked onPress={jest.fn()} />);

  expect(screen.getByText('✓')).toHaveStyle({ transform: [{ scale: 1 }] });
  expect(timing).not.toHaveBeenCalled();
});
