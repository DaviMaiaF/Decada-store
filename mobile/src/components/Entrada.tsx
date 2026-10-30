/**
 * Entrada suave: o conteúdo aparece subindo alguns pixels, na curva padrão do
 * app (`theme/motion.ts`).
 *
 * Em lista, cada item pede um `atraso` maior que o anterior e eles entram em
 * cascata, um atrás do outro. Só anima `opacity` e `transform`, que rodam no
 * driver nativo: a tela pode estar buscando dados sem a entrada engasgar. Quem
 * pediu ao sistema para reduzir o movimento vê o conteúdo já no lugar.
 *
 * O atraso só vale na montagem: o elemento entra uma vez. Se a tela mudar o
 * atraso depois (o `useCascata` faz isso), quem já está entrando não recomeça.
 */

import { type ReactNode, useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, type StyleProp, type ViewStyle } from 'react-native';

import { motion } from '../theme/motion';

export function Entrada({
  children,
  atraso = 0,
  style,
}: {
  children: ReactNode;
  /** Espera antes de começar, em ms. */
  atraso?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const progresso = useRef(new Animated.Value(0)).current;
  const atrasoNaMontagem = useRef(atraso).current;

  useEffect(() => {
    let ativo = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduzir) => {
        if (!ativo) return;
        if (reduzir) {
          progresso.setValue(1);
          return;
        }
        Animated.timing(progresso, {
          toValue: 1,
          duration: motion.duration.enter,
          delay: atrasoNaMontagem,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }).start();
      });

    return () => {
      ativo = false;
      progresso.stopAnimation();
    };
  }, [progresso, atrasoNaMontagem]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progresso,
          transform: [
            {
              translateY: progresso.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.distance.enter, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// A partir daqui a cascata para de crescer: numa lista longa, o último item não
// pode ficar quase um segundo esperando a vez.
const LIMITE_DA_CASCATA = 8;

/** Atraso do item `indice` numa lista que entra em cascata. */
export function atrasoDaCascata(indice: number): number {
  return motion.duration.stagger * Math.min(indice, LIMITE_DA_CASCATA);
}

/**
 * Cascata só na primeira vez que a lista aparece com conteúdo.
 *
 * Item que chega depois — acrescentado, recarregado — entra sem esperar a vez:
 * senão cada adição faria a pessoa aguardar a posição dele na fila. `pronta` é
 * se a lista já tem o que mostrar.
 */
export function useCascata(pronta: boolean): (indice: number) => number {
  const encerrada = useRef(false);
  // Lido na renderização: o efeito abaixo só encerra a cascata para a próxima.
  const emCascata = !encerrada.current;

  useEffect(() => {
    if (pronta) encerrada.current = true;
  }, [pronta]);

  return (indice) => (emCascata ? atrasoDaCascata(indice) : 0);
}
