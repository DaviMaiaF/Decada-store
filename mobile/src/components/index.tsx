/**
 * Componentes recorrentes dos protótipos: cartão, botão, chip de status,
 * campo de texto e barra de progresso.
 *
 * Ficam num arquivo só porque são pequenos e sempre usados juntos; quando
 * algum crescer, sai daqui.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH_HEIGHT, colors, elevation, radius, spacing, typography } from '../theme/tokens';

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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo }}
      onPress={onPress}
      disabled={inativo}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        // Compressão leve ao toque, como no protótipo.
        pressed && !inativo && styles.buttonPressed,
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
    </Pressable>
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

export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.outline}
        style={[styles.input, error ? styles.inputError : null]}
        {...props}
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
  buttonPressed: { transform: [{ scale: 0.98 }] },
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
