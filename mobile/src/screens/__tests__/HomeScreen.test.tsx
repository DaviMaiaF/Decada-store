/**
 * Testes da tela de início.
 *
 * A promessa dela é uma só: apontar a próxima etapa certa e levar à aba que a
 * resolve — a mesma etapa que a trilha marca como atual.
 */

import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as renderRtl, screen } from '@testing-library/react-native';

import * as api from '../../services/api';
import HomeScreen, { proximoPasso } from '../HomeScreen';

jest.mock('../../services/api', () => ({
  ...jest.requireActual('../../services/api'),
  readReceivedPrescriptions: jest.fn(),
}));

const lerRecebidos = api.readReceivedPrescriptions as jest.Mock;

let cliente: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  lerRecebidos.mockResolvedValue([]);
  cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});

afterEach(() => {
  cliente.clear();
  cliente.unmount();
});

function render(ui: ReactElement) {
  return renderRtl(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>);
}

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

it('cada card leva à sua aba', async () => {
  const onIr = jest.fn();
  await render(<HomeScreen etapas={jornada([false, false, false, false])} onIr={onIr} />);

  for (const aba of ['Dieta', 'Mercado', 'Despensa', 'Economia']) {
    await fireEvent.press(screen.getByLabelText(`Ir para ${aba}`));
    expect(onIr).toHaveBeenLastCalledWith(aba);
  }
  expect(onIr).toHaveBeenCalledTimes(4);
});

it('sem plano recebido, não mostra o aviso', async () => {
  await render(<HomeScreen etapas={jornada([false, false, false, false])} onIr={jest.fn()} />);

  expect(screen.queryByText('Conferir o plano')).toBeNull();
});

it('com plano enviado pela nutricionista, avisa e leva à Dieta para conferir', async () => {
  lerRecebidos.mockResolvedValue([
    {
      id: 'plano-1',
      title: 'Plano de outubro',
      notes: null,
      sent_at: '2026-10-19T10:00:00Z',
      author: { full_name: 'Camila Fernandes', crn: null },
      meals: [],
    },
  ]);
  const onIr = jest.fn();
  await render(<HomeScreen etapas={jornada([true, true, false, false])} onIr={onIr} />);

  expect(await screen.findByText('Seu plano alimentar já foi montado')).toBeTruthy();
  await fireEvent.press(screen.getByText('Conferir o plano'));

  expect(onIr).toHaveBeenCalledWith('Dieta');
});
