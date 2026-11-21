import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors, useUi } from '../../theme/token';

type Variant = 'primary' | 'secondary';
type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: Variant;
};

const LOOK = {
  primary: { face: colors.helmet, lip: colors.helmetLip, ink: colors.onHelmet, border: colors.helmet },
  secondary: { face: colors.background, lip: colors.border, ink: colors.text, border: colors.border },
};

/**
 * 면 아래에 단단한 밑턱이 있는 입체 버튼. 누르면 면이 밑턱 깊이만큼 내려가 밑턱이 사라진다.
 * 위쪽 여백과 아래 밑턱의 합이 늘 같아 눌러도 주변 배치가 흔들리지 않는다.
 */
export default function Button({ label, onPress, disabled = false, loading = false, variant = 'primary' }: Props) {
  const ui = useUi();
  const off = disabled || loading;
  const look = off ? { face: colors.sunken, lip: colors.border, ink: colors.muted, border: colors.sunken } : LOOK[variant];
  const lip = variant === 'primary' ? ui.px(5) : ui.px(3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={onPress}
      hitSlop={4}
    >
      {({ pressed }) => (
        <View style={{
          borderRadius: ui.radius.md,
          backgroundColor: look.lip,
          paddingBottom: pressed ? 0 : lip,
          marginTop: pressed ? lip : 0,
        }}>
          <View style={{
            minHeight: ui.touch,
            borderRadius: ui.radius.md,
            borderWidth: 2,
            borderColor: look.border,
            backgroundColor: look.face,
            paddingHorizontal: ui.space.md,
            paddingVertical: ui.space.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: ui.space.sm,
          }}>
            {loading ? <ActivityIndicator color={colors.muted} /> : null}
            <Text style={[ui.type.headline, { color: look.ink, textAlign: 'center' }]}>{label}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}
