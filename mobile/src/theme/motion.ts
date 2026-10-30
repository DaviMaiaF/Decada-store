/**
 * Tokens de movimento: a curva e as durações de toda animação do app.
 *
 * Vêm da seção "Motion" de `docs/design/sistema-de-design.md`. A ideia é uma
 * curva só para tudo que reage — sai rápido e assenta devagar —, para o app
 * inteiro se mover do mesmo jeito. Animação que não usa estes valores destoa.
 */

import { Easing } from 'react-native';

export const motion = {
  easing: {
    // Sai rápido e assenta devagar: entradas, toques, trocas de estado.
    standard: Easing.bezier(0.2, 0.8, 0.2, 1),
    // Vai e volta sem tranco: movimento de fundo, que repete sozinho.
    ambient: Easing.inOut(Easing.sin),
  },

  // Em ms. Quanto maior o que se move, mais tempo ele leva.
  duration: {
    press: 150,
    short: 250,
    medium: 350,
    enter: 500,
    // Meio ciclo do movimento de fundo: lento a ponto de não chamar a atenção.
    ambient: 4000,
    // Entre um item e o próximo de uma lista que entra em cascata.
    stagger: 60,
  },

  // Em px: o quanto um elemento sobe ao entrar na tela.
  distance: {
    enter: 12,
  },

  // Escala de um elemento tocável enquanto o dedo está nele.
  pressedScale: 0.98,
} as const;
