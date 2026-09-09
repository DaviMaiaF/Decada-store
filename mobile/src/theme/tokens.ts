/**
 * Tokens do sistema de design.
 *
 * Copiados de `docs/design/sistema-de-design.md`, do bloco de tokens — que é o
 * que os protótipos realmente renderizam. Onde a prosa daquele documento cita
 * outro valor, vale este arquivo.
 */

export const colors = {
  // Superfícies, do fundo para o topo.
  surface: '#f6fbf5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f0f5f0',
  surfaceContainer: '#ebefea',
  surfaceContainerHigh: '#e5e9e4',
  surfaceContainerHighest: '#dfe4df',

  // Texto e contornos.
  onSurface: '#181d1a',
  onSurfaceVariant: '#414844',
  outline: '#717973',
  outlineVariant: '#c1c8c2',

  // Verde manjericão: ações de maior hierarquia.
  primary: '#012d1d',
  onPrimary: '#ffffff',
  primaryContainer: '#1b4332',
  onPrimaryContainer: '#86af99',
  primaryFixed: '#c1ecd4',
  primaryFixedDim: '#a5d0b9',
  onPrimaryFixed: '#002114',
  onPrimaryFixedVariant: '#274e3d',

  // Terracota: calor, destaque e ação secundária.
  secondary: '#904d00',
  onSecondary: '#ffffff',
  secondaryContainer: '#fe932c',
  onSecondaryContainer: '#663500',
  secondaryFixed: '#ffdcc3',
  secondaryFixedDim: '#ffb77d',
  onSecondaryFixed: '#2f1500',
  onSecondaryFixedVariant: '#6e3900',

  // Sálvia: saúde financeira e economia.
  tertiary: '#002d1c',
  tertiaryContainer: '#00452e',
  onTertiaryContainer: '#75b393',
  tertiaryFixed: '#b1f0ce',
  tertiaryFixedDim: '#95d4b3',
  onTertiaryFixed: '#002114',
  onTertiaryFixedVariant: '#0e5138',

  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  inverseSurface: '#2c322e',
  inverseOnSurface: '#edf2ed',
} as const;

export const spacing = {
  xs2: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xl2: 32,
  xl3: 40,
  xl4: 48,
  // Margem lateral fixa da grade móvel.
  margin: 20,
  gutter: 12,
} as const;

export const radius = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

/**
 * Escala tipográfica. `fontFamily` aponta para os pesos da Plus Jakarta Sans
 * carregados em `useAppFonts`.
 */
export const typography = {
  displayLg: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 36, lineHeight: 44, letterSpacing: -1.08 },
  displaySm: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 30, lineHeight: 38, letterSpacing: -0.6 },
  headlineLg: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 26, lineHeight: 34, letterSpacing: -0.52 },
  headlineMd: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, lineHeight: 30, letterSpacing: -0.22 },
  headlineSm: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 18, lineHeight: 26 },
  bodyLg: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 17, lineHeight: 26 },
  bodyMd: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, lineHeight: 22 },
  bodySm: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, lineHeight: 18 },
  labelLg: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, lineHeight: 20, letterSpacing: 0.14 },
  labelMd: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  labelSm: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, lineHeight: 14, letterSpacing: 0.44 },
  currency: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 28, lineHeight: 34, letterSpacing: -0.56 },
} as const;

/**
 * Sombras orgânicas: verde translúcido em vez de preto, para o cartão pousar
 * na superfície sem o contorno industrial de uma sombra neutra.
 */
export const elevation = {
  card: {
    shadowColor: '#1b4332',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#1b4332',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
} as const;

// Altura mínima de área tocável: o app é usado andando pelo mercado.
export const MIN_TOUCH_HEIGHT = 48;
