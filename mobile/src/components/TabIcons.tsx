/**
 * Ícones da barra de abas.
 *
 * São desenhados aqui, e não trazidos de um pacote de ícones: são quatro, o
 * traço acompanha o sistema de design e a cor vem de quem chama — a barra pinta
 * o ícone ativo com a mesma cor do rótulo ativo, sem o ícone precisar saber
 * disso.
 *
 * Os motivos são os do protótipo (calendário, sacola, geladeira e dinheiro
 * guardado), em 22px, como está em `docs/design/prototipos`. Sem `tabBarIcon` o
 * React Navigation desenha um `MissingIcon`, que é o caractere ⏷ — e a fonte da
 * versão web não tem esse glifo, então aparecia uma caixa vazia.
 */

import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

/** Tamanho do protótipo. A barra pode pedir outro; o padrão é este. */
const TAMANHO = 22;
const TRACO = 1.7;

type IconeProps = {
  color: string;
  size?: number;
};

function Moldura({
  color,
  size = TAMANHO,
  children,
}: IconeProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={TRACO}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** Dieta: calendário — o plano da semana. */
export function IconeDieta(props: IconeProps) {
  return (
    <Moldura {...props}>
      <Rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <Line x1="3.5" y1="9.8" x2="20.5" y2="9.8" />
      <Line x1="8.2" y1="2.8" x2="8.2" y2="6.2" />
      <Line x1="15.8" y1="2.8" x2="15.8" y2="6.2" />
    </Moldura>
  );
}

/** Mercado: sacola de compras. */
export function IconeMercado(props: IconeProps) {
  return (
    <Moldura {...props}>
      <Path d="M6.4 8.2 H17.6 L18.8 20.6 H5.2 Z" />
      <Path d="M9 8.2 V6.4 a3 3 0 0 1 6 0 V8.2" />
    </Moldura>
  );
}

/** Despensa: geladeira, com as duas portas e os puxadores. */
export function IconeDespensa(props: IconeProps) {
  return (
    <Moldura {...props}>
      <Rect x="5.5" y="2.8" width="13" height="18.4" rx="2.4" />
      <Line x1="5.5" y1="9.6" x2="18.5" y2="9.6" />
      <Line x1="8.8" y1="5.8" x2="8.8" y2="7.8" />
      <Line x1="8.8" y1="11.8" x2="8.8" y2="14.6" />
    </Moldura>
  );
}

/**
 * Economia: cédula com moeda — dinheiro, sem rodeio.
 *
 * Duas tentativas anteriores falharam por ambiguidade a este tamanho: pilha de
 * moedas vira o cilindro de banco de dados, e cofrinho vira um oval com um
 * risco quando o focinho e as pernas somem. Retângulo com círculo dentro é lido
 * como dinheiro em qualquer tamanho, que é o que a aba precisa dizer.
 */
export function IconeEconomia(props: IconeProps) {
  return (
    <Moldura {...props}>
      <Rect x="2.6" y="6.6" width="18.8" height="10.8" rx="2.2" />
      <Circle cx="12" cy="12" r="2.6" />
      <Line x1="5.9" y1="12" x2="6.1" y2="12" />
      <Line x1="17.9" y1="12" x2="18.1" y2="12" />
    </Moldura>
  );
}
