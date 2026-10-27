/**
 * Testes da trilha da jornada.
 *
 * O que importa é a trilha dizer onde a pessoa está: etapa que ficou para trás
 * aparece como feita, mesmo que não tenha sido cumprida por inteiro.
 */

import { render, screen } from '@testing-library/react-native';

import { Trilha, etapasUltrapassadas } from '../Trilha';

const jornada = [
  { rotulo: 'Enviar', cumprida: true },
  { rotulo: 'Confirmar', cumprida: false, detalhe: '9/16' },
  { rotulo: 'Despensa', cumprida: false },
  { rotulo: 'Região', cumprida: true },
  { rotulo: 'Comprar', cumprida: false, detalhe: '3/9' },
];

it('etapa com uma seguinte cumprida conta como ultrapassada', () => {
  expect(etapasUltrapassadas(jornada)).toEqual([true, true, true, true, false]);
});

it('nada cumprido, nada ultrapassado', () => {
  expect(
    etapasUltrapassadas([
      { rotulo: 'Enviar', cumprida: false },
      { rotulo: 'Confirmar', cumprida: false },
    ]),
  ).toEqual([false, false]);
});

it('a etapa atual é a primeira não ultrapassada', async () => {
  await render(<Trilha etapas={jornada} />);

  expect(screen.getByLabelText('Etapa 5 de 5: Comprar')).toBeTruthy();
  // O "9/16" dizia que a pessoa ainda estava confirmando, e ela já foi adiante.
  expect(screen.queryByText('9/16')).toBeNull();
  expect(screen.getByText('3/9')).toBeTruthy();
  expect(screen.getAllByText('✓')).toHaveLength(4);
});

it('com tudo cumprido, a jornada aparece concluída', async () => {
  await render(
    <Trilha etapas={jornada.map((etapa) => ({ ...etapa, cumprida: true }))} />,
  );

  expect(screen.getByLabelText('Jornada concluída')).toBeTruthy();
  expect(screen.getAllByText('✓')).toHaveLength(5);
});
