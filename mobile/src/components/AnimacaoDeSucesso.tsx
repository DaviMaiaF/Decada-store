/**
 * Ícone de sucesso animado: o círculo surge com um leve pulo e o ✓ é revelado
 * da esquerda para a direita — no espírito do alerta de sucesso do SweetAlert2.
 *
 * Tudo roda no driver nativo (só `transform` e `opacity`), então a thread JS
 * ocupada — a compra concluindo, a lista sendo relida — não engasga a animação.
 * O traço desenhado por `strokeDashoffset` não andava no driver nativo e travava
 * justamente nesse momento. O ✓ é revelado por uma janela que se abre: a janela
 * desliza para dentro e o desenho desliza para fora no mesmo ritmo, e ele fica
 * parado no lugar. Quem pediu ao sistema para reduzir o movimento vê o ícone
 * pronto.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { motion } from '../theme/motion';
import { colors } from '../theme/tokens';

const TAMANHO = 96;
const ESPESSURA = 5;
const RAIO = (TAMANHO - ESPESSURA) / 2;

export function AnimacaoDeSucesso({ tamanho = TAMANHO }: { tamanho?: number }) {
  const circulo = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const escala = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    let ativo = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduzir) => {
        if (!ativo) return;
        if (reduzir) {
          circulo.setValue(1);
          check.setValue(1);
          escala.setValue(1);
          return;
        }
        Animated.sequence([
          Animated.parallel([
            Animated.timing(circulo, {
              toValue: 1,
              duration: motion.duration.short,
              easing: motion.easing.standard,
              useNativeDriver: true,
            }),
            Animated.spring(escala, {
              toValue: 1,
              friction: 6,
              tension: 140,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(check, {
            toValue: 1,
            duration: motion.duration.medium,
            easing: motion.easing.standard,
            useNativeDriver: true,
          }),
        ]).start();
      });

    return () => {
      ativo = false;
    };
  }, [circulo, check, escala]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Compra concluída"
      style={{ width: tamanho, height: tamanho, transform: [{ scale: escala }] }}
    >
      <Animated.View style={{ width: tamanho, height: tamanho, opacity: circulo }}>
        <Svg width={tamanho} height={tamanho} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}>
          <Circle
            cx={TAMANHO / 2}
            cy={TAMANHO / 2}
            r={RAIO}
            stroke={colors.onPrimaryFixedVariant}
            strokeWidth={ESPESSURA}
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Janela do ✓: abre sozinha da esquerda; o desenho vai no sentido contrário. */}
      <Animated.View
        style={[
          styles.janela,
          {
            transform: [
              { translateX: check.interpolate({ inputRange: [0, 1], outputRange: [-tamanho, 0] }) },
            ],
          },
        ]}
      >
        <Animated.View
          style={{
            width: tamanho,
            height: tamanho,
            transform: [
              { translateX: check.interpolate({ inputRange: [0, 1], outputRange: [tamanho, 0] }) },
            ],
          }}
        >
          <Svg width={tamanho} height={tamanho} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}>
            <Path
              d="M28 50 L42 64 L70 34"
              stroke={colors.onPrimaryFixedVariant}
              strokeWidth={ESPESSURA + 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  janela: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
