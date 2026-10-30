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
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const VERDE = '#1B4332';
const TERRACOTA = '#E76F51';
const SALVIA = '#52B788';
const TINTA = '#1F2421';

/** Altura do selo no arquivo da marca; o resto se mede em proporção a ela. */
const SELO = 36;

export function Logo({
  tamanho = SELO,
  comNome = true,
}: {
  /** Altura do selo, em px. O nome acompanha. */
  tamanho?: number;
  /** Sem o nome, sobra só o selo — para onde o espaço é curto. */
  comNome?: boolean;
}) {
  const escala = tamanho / SELO;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="DÉCADA"
      style={[styles.linha, { gap: 10 * escala }]}
    >
      <Svg width={tamanho} height={tamanho} viewBox="0 0 36 36" fill="none">
        <Rect width={36} height={36} rx={10} fill={VERDE} />
        <Path
          d="M12 8C12 8 24 8 24 18C24 28 12 28 12 28V8Z"
          stroke={TERRACOTA}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={18} cy={18} r={3} fill={SALVIA} />
      </Svg>
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
  nome: { fontFamily: 'PlusJakartaSans_800ExtraBold', color: TINTA },
});
