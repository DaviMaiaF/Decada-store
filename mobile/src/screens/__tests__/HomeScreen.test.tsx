/**
 * Testes da tela de início.
 *
 * A promessa dela é uma só: apontar a próxima etapa certa e levar à aba que a
 * resolve — a mesma etapa que a trilha marca como atual.
 */

import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen, { proximoPasso } from '../HomeScreen';

function jornada(cumpridas: boolean[], detalhes: (string | undefined)[] = []) {
  return ['Enviar', 'Confirmar', 'Região', 'Comprar'].map((rotulo, i) => ({
    rotulo,
    cumprida: cumpridas[i],
    detalhe: detalhes[i],
  }));
}

it('sem nada feito, o passo é enviar o plano na Dieta', () => {
  const passo = proximoPasso(jornada([false, false, false, false]));

  expect(passo.aba).toBe('Dieta');
  expect(passo.botao).toBe('Enviar o plano');
});

it('etapa ultrapassada não volta a ser o próximo passo', () => {
  // Lista gerada com a confirmação parcial: o passo é comprar, não confirmar.
  const passo = proximoPasso(
    jornada([true, false, true, false], [undefined, '9/16', undefined, '3/9']),
  );

  expect(passo.aba).toBe('Mercado');
  expect(passo.titulo).toBe('Faça a sua compra');
  expect(passo.detalhe).toBe('3/9');
});

it('com a compra concluída, aponta a economia', () => {
  const passo = proximoPasso(jornada([true, true, true, true]));

  expect(passo.titulo).toBe('Compra concluída');
  expect(passo.aba).toBe('Economia');
});

it('o botão leva à aba da próxima etapa', async () => {
  const onIr = jest.fn();
  await render(
    <HomeScreen etapas={jornada([true, true, false, false])} onIr={onIr} />,
  );

  await fireEvent.press(screen.getByText('Gerar a lista'));

  expect(onIr).toHaveBeenCalledWith('Mercado');
});
