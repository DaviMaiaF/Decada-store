/** Testes da logo. */

import { render, screen } from '@testing-library/react-native';

import { Logo } from '../Logo';

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
