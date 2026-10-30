/**
 * Componentes recorrentes dos protótipos: cartão, botão, chip de status,
 * campo de texto e barra de progresso.
 *
 * Ficam num arquivo só porque são pequenos e sempre usados juntos; quando
 * algum crescer, sai daqui.
 */

import { type ReactNode, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { motion } from '../theme/motion';
import { MIN_TOUCH_HEIGHT, colors, elevation, radius, spacing, typography } from '../theme/tokens';
import { Tocavel } from './Tocavel';

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.bodyMuted]}>{children}</Text>;
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const inativo = disabled || loading;

  return (
    // Compressão leve ao toque, como no protótipo: quem anima é o Tocavel.
    <Tocavel
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo }}
      onPress={onPress}
      disabled={inativo}
      style={[
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        inativo && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onPrimary : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'primary' && styles.buttonLabelPrimary,
            variant === 'secondary' && styles.buttonLabelSecondary,
            variant === 'ghost' && styles.buttonLabelGhost,
          ]}
        >
          {label}
        </Text>
      )}
    </Tocavel>
  );
}

type ChipTone = 'neutral' | 'success' | 'warning' | 'danger';

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: ChipTone }) {
  return (
    <View style={[styles.chip, chipTones[tone].container]}>
      <Text style={[styles.chipLabel, chipTones[tone].label]}>{label}</Text>
    </View>
  );
}

/** Caixa de seleção. O rótulo é obrigatório: sem ele o leitor de tela anuncia
 * só "caixa de seleção", e numa lista de itens ninguém sabe qual é qual.
 *
 * Responde ao dedo como o `Button`, e o ✓ cresce ao marcar. Caixa que já abre
 * marcada mostra o ✓ parado: a animação é resposta ao toque, não à carga. */
export function Checkbox({
  label,
  checked,
  onPress,
  disabled,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const montada = useRef(false);
  useEffect(() => {
    montada.current = true;
  }, []);

  return (
    <Tocavel
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={spacing.xs}
      style={[styles.checkbox, checked && styles.checkboxChecked, disabled && styles.buttonDisabled]}
    >
      {checked ? <MarcaDaCaixa animar={montada.current} /> : null}
    </Tocavel>
  );
}

function MarcaDaCaixa({ animar }: { animar: boolean }) {
  const escala = useRef(new Animated.Value(animar ? 0 : 1)).current;

  useEffect(() => {
    if (!animar) return;
    Animated.timing(escala, {
      toValue: 1,
      duration: motion.duration.short,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [animar, escala]);

  return (
    <Animated.Text style={[styles.checkboxMark, { transform: [{ scale: escala }] }]}>✓</Animated.Text>
  );
}

export function Field({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.outline}
        {...props}
        // O estilo de quem chama soma ao do campo, em vez de apagar borda e fundo.
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  const largura = Math.max(0, Math.min(100, percent));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: largura, min: 0, max: 100 }}
      style={styles.progressTrack}
    >
      <View style={[styles.progressFill, { width: `${largura}%` }]} />
    </View>
  );
}

/** Aviso de erro que não some sozinho: erro engolido vira suporte depois. */
export function ErrorNotice({ message }: { message: string }) {
  return (
    <View style={styles.errorNotice}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const chipTones: Record<ChipTone, { container: ViewStyle; label: { color: string } }> = {
  neutral: {
    container: { backgroundColor: colors.surfaceContainerHigh },
    label: { color: colors.onSurfaceVariant },
  },
  success: {
    container: { backgroundColor: colors.primaryFixed },
    label: { color: colors.onPrimaryFixedVariant },
  },
  warning: {
    container: { backgroundColor: colors.secondaryFixed },
    label: { color: colors.onSecondaryFixedVariant },
  },
  danger: {
    container: { backgroundColor: colors.errorContainer },
    label: { color: colors.onErrorContainer },
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...elevation.card,
  },
  sectionTitle: { ...typography.headlineSm, color: colors.primary },
  body: { ...typography.bodyMd, color: colors.onSurface },
  bodyMuted: { color: colors.onSurfaceVariant },

  button: {
    minHeight: MIN_TOUCH_HEIGHT,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  buttonPrimary: { backgroundColor: colors.primaryContainer },
  buttonSecondary: { backgroundColor: colors.secondaryContainer },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { ...typography.labelLg },
  buttonLabelPrimary: { color: colors.onPrimary },
  buttonLabelSecondary: { color: colors.onSecondaryContainer },
  buttonLabelGhost: { color: colors.primary },

  chip: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs2,
    alignSelf: 'flex-start',
  },
  chipLabel: { ...typography.labelSm },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  checkboxMark: { ...typography.labelLg, color: colors.onPrimary, lineHeight: 18 },

  field: { gap: spacing.xs2 },
  fieldLabel: { ...typography.labelMd, color: colors.onSurfaceVariant },
  input: {
    minHeight: MIN_TOUCH_HEIGHT,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.md,
    ...typography.bodyMd,
    color: colors.onSurface,
  },
  inputError: { borderColor: colors.error },
  fieldError: { ...typography.labelSm, color: colors.error },

  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: radius.full, backgroundColor: colors.primaryContainer },

  errorNotice: {
    backgroundColor: colors.errorContainer,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  errorText: { ...typography.bodySm, color: colors.onErrorContainer },
});
