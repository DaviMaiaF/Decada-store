/** Testes da logo. */

import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Animated } from 'react-native';

import { Logo } from '../Logo';
import { motion } from '../../theme/motion';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Logo', () => {
  it('é uma imagem só para o leitor de tela, chamada DÉCADA', async () => {
    await render(<Logo />);

    expect(screen.getByRole('image', { name: 'DÉCADA' })).toBeOnTheScreen();
    expect(screen.getByText('DÉCADA')).toBeOnTheScreen();
  });

  it('sem o nome, sobra o selo e o rótulo continua', async () => {
    await render(<Logo comNome={false} />);

    expect(screen.getByRole('image', { name: 'DÉCADA' })).toBeOnTheScreen();
    expect(screen.queryByText('DÉCADA')).toBeNull();
  });

  it('o nome cresce junto com o selo', async () => {
    await render(<Logo tamanho={72} />);

    expect(screen.getByText('DÉCADA')).toHaveStyle({ fontSize: 44 });
  });
});

// O driver nativo não roda no Jest: os testes conferem o pedido de animação.
describe('Logo viva', () => {
  function espiar() {
    const parar = jest.fn();
    const loop = jest
      .spyOn(Animated, 'loop')
      .mockReturnValue({ start: jest.fn(), stop: parar } as unknown as Animated.CompositeAnimation);
    const timing = jest.spyOn(Animated, 'timing');
    return { loop, timing, parar };
  }

  it('o ponto respira sem parar, devagar, e para ao sair da tela', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { loop, timing, parar } = espiar();

    const { unmount } = await render(<Logo vivo />);

    expect(screen.getByTestId('logo-ponto')).toBeOnTheScreen();
    expect(loop).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls.map(([, config]) => config)).toEqual([
      expect.objectContaining({
        toValue: 1,
        duration: motion.duration.ambient,
        easing: motion.easing.ambient,
        useNativeDriver: true,
      }),
      expect.objectContaining({ toValue: 0, duration: motion.duration.ambient }),
    ]);

    await unmount();
    expect(parar).toHaveBeenCalled();
  });

  it('com movimento reduzido, o ponto fica parado', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { loop } = espiar();

    await render(<Logo vivo />);

    expect(screen.getByTestId('logo-ponto')).toBeOnTheScreen();
    expect(loop).not.toHaveBeenCalled();
  });

  it('sem vivo, a logo não anima nada', async () => {
    const { loop } = espiar();

    await render(<Logo />);

    expect(screen.queryByTestId('logo-ponto')).toBeNull();
    expect(loop).not.toHaveBeenCalled();
  });
});
