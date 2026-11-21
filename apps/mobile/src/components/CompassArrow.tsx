import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { tokens } from '../theme/token';

/**
 * 새 목표 각도까지 따라가는 시간. 포즈가 ~10Hz(100ms 간격)로 오므로 그보다 조금 길게 잡고 등속(linear)으로 따라간다.
 * 등속이면 계속 돌 때 갱신마다 속도가 같게 이어진다. ease-out은 갱신마다 처음 속도가 2배로 튀어 10Hz로 울컥거렸다
 */
const FOLLOW_MS = 150;
const HEAD_HEIGHT = 64;

export default function CompassArrow({ rotationDeg }: { rotationDeg: number | null }) {
  const visible = rotationDeg !== null && Number.isFinite(rotationDeg);
  // 렌더 중 ref를 읽지 않도록 값과 회전 보간을 state로 한 번만 만든다
  const [{ angle, rotate }] = useState(() => {
    const value = new Animated.Value(0);
    return { angle: value, rotate: value.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) };
  });
  // 펼친(unwrapped) 현재 목표. 359→0을 넘을 때 한 바퀴 돌지 않도록 최단 차이만 더해 간다
  const target = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) {
      target.current = null;
      return;
    }
    if (target.current === null) {
      // 처음 나타날 때는 돌아 들어오지 않고 바로 그 방향에 둔다
      target.current = rotationDeg;
      angle.setValue(rotationDeg);
      return;
    }
    target.current += ((rotationDeg - target.current) % 360 + 540) % 360 - 180;
    // 진행 중인 애니메이션은 지금 각도에서 멈추고 새 목표로 이어 간다
    Animated.timing(angle, {
      toValue: target.current,
      duration: FOLLOW_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [visible, rotationDeg, angle]);

  if (!visible) {
    return <Text style={styles.status} accessibilityLiveRegion="polite">방향 확인 중</Text>;
  }

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="image"
      accessibilityLabel={`진행 방향, 카메라 정면 기준 ${Math.round(rotationDeg)}도`}
      style={[styles.arrow, { transform: [{ rotate }] }]}
      // 배경 없는 뷰의 그림자는 매 프레임 다시 계산된다 → 한 번 비트맵으로 굳혀 돌리기만 한다
      shouldRasterizeIOS
    >
      <View style={styles.head} />
      <View style={styles.shaft} />
    </Animated.View>
  );
}

// 카메라 영상 위에 바로 그리므로 흰 화살표에 어두운 그림자를 둘러 밝은 배경에서도 보이게 한다.
// shortcut: 그림자가 모양을 따라가는 건 iOS뿐이다(안드로이드 elevation은 테두리 삼각형에 안 먹음), 안드로이드를 지원할 때 SVG로 바꾼다
const styles = StyleSheet.create({
  arrow: {
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  // 테두리로 만든 삼각형 머리
  head: {
    width: 0,
    height: 0,
    borderLeftWidth: 52,
    borderRightWidth: 52,
    borderBottomWidth: HEAD_HEIGHT,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: tokens.colors.onCamera,
  },
  shaft: {
    width: 40,
    height: 74,
    marginTop: -6, // 머리와 몸통 사이 틈이 비치지 않게 살짝 겹친다
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: tokens.colors.onCamera,
  },
  status: {
    color: tokens.colors.onCamera,
    fontSize: tokens.fontSize.body,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
});
