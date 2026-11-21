import { StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/token';

export default function CompassArrow({ rotationDeg }: { rotationDeg: number | null }) {
  if (rotationDeg === null || !Number.isFinite(rotationDeg)) {
    return <Text style={styles.status} accessibilityLiveRegion="polite">방향 확인 중</Text>;
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text
        accessibilityRole="image"
        accessibilityLabel={`진행 방향, 카메라 정면 기준 ${Math.round(rotationDeg)}도`}
        style={[styles.arrow, { transform: [{ rotate: `${rotationDeg}deg` }] }]}
      >
        ↑
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', padding: tokens.spacing.md },
  arrow: { color: tokens.colors.primary, fontSize: 80, lineHeight: 100 },
  status: { color: tokens.colors.muted, fontSize: tokens.fontSize.body, textAlign: 'center' },
});
