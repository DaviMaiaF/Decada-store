/**
 * Área tocável que responde ao dedo: encolhe de leve enquanto é pressionada e
 * volta ao soltar, na curva padrão do app (`theme/motion.ts`).
 *
 * Antes a compressão era um estilo de `pressed`, que pulava de um tamanho para
 * o outro de uma vez. Aqui ela anda, e anda no driver nativo. O estilo é fixo,
 * não uma função de `pressed`: a escala animada é quem cuida do toque.
 *
 * Não depende do reduzir movimento do sistema: é resposta a um toque, do
 * tamanho de 2%, e não algo que se move pela tela sozinho.
 */

import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { motion } from '../theme/motion';

const PressableAnimado = Animated.createAnimatedComponent(Pressable);

export function Tocavel({
  style,
  onPressIn,
  onPressOut,
  ...resto
}: Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> }) {
  const escala = useRef(new Animated.Value(1)).current;

  function irPara(valor: number) {
    Animated.timing(escala, {
      toValue: valor,
      duration: motion.duration.press,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }

  return (
    <PressableAnimado
      {...resto}
      onPressIn={(evento) => {
        irPara(motion.pressedScale);
        onPressIn?.(evento);
      }}
      onPressOut={(evento) => {
        irPara(1);
        onPressOut?.(evento);
      }}
      style={[style, { transform: [{ scale: escala }] }]}
    />
  );
}
