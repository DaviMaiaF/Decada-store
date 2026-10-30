/**
 * Logo da DÉCADA: o selo (o "D" terracota sobre o quadrado verde) e, ao lado,
 * o nome.
 *
 * O desenho vem de `docs/design/marca/logo-decada.svg`. O selo é SVG; o nome é
 * texto do React Native, na Plus Jakarta Sans que o app já carrega — um
 * `<Text>` dentro do SVG não enxerga as fontes do expo-font e cairia na fonte
 * do sistema.
 *
 * As cores são as da marca, não as do tema: a logo não muda se a paleta mudar.
 *
 * Com `vivo`, o ponto sálvia do selo respira: cresce e volta, devagar e sem
 * parar. É o movimento de fundo da tela (no máximo um por tela, diz o sistema
 * de design). O ponto sai do SVG e vira uma `View` por cima dele, porque o
 * driver nativo anima `transform` de `View`, não atributo de SVG. Quem pediu ao
 * sistema para reduzir o movimento vê o ponto parado.
 */

import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { motion } from '../theme/motion';

const VERDE = '#1B4332';
const TERRACOTA = '#E76F51';
const SALVIA = '#52B788';
const TINTA = '#1F2421';

/** Altura do selo no arquivo da marca; o resto se mede em proporção a ela. */
const SELO = 36;
/** O ponto, nas medidas do selo: centro em (18, 18), raio 3. */
const PONTO_CENTRO = 18;
const PONTO_RAIO = 3;
/** O quanto o ponto cresce no auge da respiração. */
const RESPIRACAO = 1.25;

export function Logo({
  tamanho = SELO,
  comNome = true,
  vivo = false,
}: {
  /** Altura do selo, em px. O nome acompanha. */
  tamanho?: number;
  /** Sem o nome, sobra só o selo — para onde o espaço é curto. */
  comNome?: boolean;
  /** O ponto do selo respira. */
  vivo?: boolean;
}) {
  const escala = tamanho / SELO;
  const respiracao = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!vivo) return;
    let ativo = true;
    let ciclo: Animated.CompositeAnimation | null = null;

    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduzir) => {
        if (!ativo || reduzir) return;
        const meioCiclo = (valor: number) =>
          Animated.timing(respiracao, {
            toValue: valor,
            duration: motion.duration.ambient,
            easing: motion.easing.ambient,
            useNativeDriver: true,
          });
        ciclo = Animated.loop(Animated.sequence([meioCiclo(1), meioCiclo(0)]));
        ciclo.start();
      });

    return () => {
      ativo = false;
      ciclo?.stop();
    };
  }, [vivo, respiracao]);

  const diametro = PONTO_RAIO * 2 * escala;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="DÉCADA"
      style={[styles.linha, { gap: 10 * escala }]}
    >
      <View>
        <Svg width={tamanho} height={tamanho} viewBox="0 0 36 36" fill="none">
          <Rect width={36} height={36} rx={10} fill={VERDE} />
          <Path
            d="M12 8C12 8 24 8 24 18C24 28 12 28 12 28V8Z"
            stroke={TERRACOTA}
            strokeWidth={3.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {vivo ? null : (
            <Circle cx={PONTO_CENTRO} cy={PONTO_CENTRO} r={PONTO_RAIO} fill={SALVIA} />
          )}
        </Svg>
        {vivo ? (
          <Animated.View
            testID="logo-ponto"
            style={[
              styles.ponto,
              {
                width: diametro,
                height: diametro,
                borderRadius: diametro / 2,
                left: (PONTO_CENTRO - PONTO_RAIO) * escala,
                top: (PONTO_CENTRO - PONTO_RAIO) * escala,
                transform: [
                  {
                    scale: respiracao.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, RESPIRACAO],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
      </View>
      {comNome ? (
        <Text style={[styles.nome, { fontSize: 22 * escala, letterSpacing: 1.5 * escala }]}>
          DÉCADA
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: { flexDirection: 'row', alignItems: 'center' },
  ponto: { position: 'absolute', backgroundColor: SALVIA },
  nome: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: TINTA },
});
