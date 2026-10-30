/**
 * Entrada suave: o conteúdo aparece subindo alguns pixels, na curva padrão do
 * app (`theme/motion.ts`).
 *
 * Em lista, cada item pede um `atraso` maior que o anterior e eles entram em
 * cascata, um atrás do outro. Só anima `opacity` e `transform`, que rodam no
 * driver nativo: a tela pode estar buscando dados sem a entrada engasgar. Quem
 * pediu ao sistema para reduzir o movimento vê o conteúdo já no lugar.
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
          delay: atraso,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }).start();
      });

    return () => {
      ativo = false;
      progresso.stopAnimation();
    };
  }, [progresso, atraso]);

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
