import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { tokens } from '../../theme/token';

type Props = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };

export default function Button({ label, onPress, disabled = false, loading = false }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.button, (disabled || loading) && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={tokens.colors.background} /> : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius,
    minHeight: 48,
    padding: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  disabled: { opacity: 0.5 },
  label: { color: tokens.colors.background, fontSize: tokens.fontSize.body, fontWeight: '700' },
});
