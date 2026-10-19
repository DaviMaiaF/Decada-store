/**
 * Ícone de sucesso animado: o círculo se desenha, o conjunto dá um leve pulo e
 * o ✓ é traçado por cima — no espírito do alerta de sucesso do SweetAlert2.
 *
 * Feito com Animated e react-native-svg, que o app já tem: nenhuma dependência
 * nova por causa de um segundo e meio de animação. Quem pediu ao sistema para
 * reduzir o movimento vê o ícone pronto, sem traço nenhum.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

const CirculoAnimado = Animated.createAnimatedComponent(Circle);
const TracoAnimado = Animated.createAnimatedComponent(Path);

const TAMANHO = 96;
const ESPESSURA = 5;
const RAIO = (TAMANHO - ESPESSURA) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
// O ✓ é dois segmentos: (28,50)→(42,64) e (42,64)→(70,34). Comprimento somado.
const COMPRIMENTO_CHECK = Math.hypot(14, 14) + Math.hypot(28, 30);

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
        // Valores de traço não andam no driver nativo: a animação roda em JS.
        Animated.sequence([
          Animated.parallel([
            Animated.timing(circulo, {
              toValue: 1,
              duration: 600,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.spring(escala, {
              toValue: 1,
              friction: 4,
              tension: 80,
              useNativeDriver: false,
            }),
          ]),
          Animated.timing(check, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
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
      <Svg width={tamanho} height={tamanho} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}>
        {/* O anel claro fica parado; o traço verde é que corre por cima dele. */}
        <Circle
          cx={TAMANHO / 2}
          cy={TAMANHO / 2}
          r={RAIO}
          stroke={colors.primaryFixed}
          strokeWidth={ESPESSURA}
          fill="none"
        />
        <CirculoAnimado
          cx={TAMANHO / 2}
          cy={TAMANHO / 2}
          r={RAIO}
          stroke={colors.onPrimaryFixedVariant}
          strokeWidth={ESPESSURA}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUNFERENCIA} ${CIRCUNFERENCIA}`}
          strokeDashoffset={circulo.interpolate({
            inputRange: [0, 1],
            outputRange: [CIRCUNFERENCIA, 0],
          })}
          // Começa no topo, como o do SweetAlert2, e não às três horas.
          transform={`rotate(-90 ${TAMANHO / 2} ${TAMANHO / 2})`}
        />
        <TracoAnimado
          d="M28 50 L42 64 L70 34"
          stroke={colors.onPrimaryFixedVariant}
          strokeWidth={ESPESSURA + 1}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={`${COMPRIMENTO_CHECK} ${COMPRIMENTO_CHECK}`}
          strokeDashoffset={check.interpolate({
            inputRange: [0, 1],
            outputRange: [COMPRIMENTO_CHECK, 0],
          })}
        />
      </Svg>
    </Animated.View>
  );
}
