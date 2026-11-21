import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  isARSupportedOnDevice,
  ViroARScene,
  ViroARSceneNavigator,
  ViroTrackingStateConstants,
  type ViroCameraTransform,
  type ViroTrackingState,
} from '@reactvision/react-viro';

import type { ArFrame } from '../localization/localizer';
import { tokens } from '../theme/token';

/** 위치 추정에는 10Hz면 충분하다. 카메라 변환 이벤트는 매 프레임(60Hz) 온다 */
const FRAME_INTERVAL_S = 0.1;

function trackingOf(state: ViroTrackingState): ArFrame['tracking'] {
  if (state === ViroTrackingStateConstants.TRACKING_NORMAL) return 'normal';
  if (state === ViroTrackingStateConstants.TRACKING_LIMITED) return 'limited';
  return 'notAvailable';
}

/**
 * ARKit 카메라 화면. 카메라 위치·방위를 ArFrame으로 약 10Hz 내보낸다.
 * AR을 못 쓰는 기기(iOS 시뮬레이터 등)는 어두운 빈 화면만 그리고 아무것도 내보내지 않는다.
 */
export default function ArView({ onFrame }: { onFrame: (frame: ArFrame) => void }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const onFrameRef = useRef(onFrame);
  useEffect(() => { onFrameRef.current = onFrame; });
  const tracking = useRef<ArFrame['tracking']>('notAvailable');
  const lastT = useRef(-Infinity);

  useEffect(() => {
    let cancelled = false;
    isARSupportedOnDevice().then(
      (r) => { if (!cancelled) setSupported(r.isARSupported); },
      () => { if (!cancelled) setSupported(false); },
    );
    return () => { cancelled = true; };
  }, []);

  // 장면 컴포넌트도 한 번만 만든다. 콜백은 ref로 최신 값을 읽는다
  const [initialScene] = useState(() => ({
    scene: () => (
      <ViroARScene
        onTrackingUpdated={(state: ViroTrackingState) => { tracking.current = trackingOf(state); }}
        onCameraTransformUpdate={(c: ViroCameraTransform) => {
          const t = performance.now() / 1000; // usePdrSteps와 같은 시계
          if (t - lastT.current < FRAME_INTERVAL_S) return;
          lastT.current = t;
          const [x, y, z] = c.position;
          const [fx, , fz] = c.forward;
          // AR 월드: x 오른쪽, y 위, z 뒤. 방위는 −z에서 시계 방향
          const yawDeg = ((Math.atan2(fx, -fz) * 180 / Math.PI) + 360) % 360;
          onFrameRef.current({ t, x, y, z, yawDeg, tracking: tracking.current });
        }}
      />
    ),
  }));

  if (!supported) return <View style={styles.placeholder} />;
  return (
    <ViroARSceneNavigator
      style={styles.fill}
      initialScene={initialScene}
      worldAlignment="Gravity"
      provider="none"
      autofocus
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  placeholder: { flex: 1, backgroundColor: tokens.colors.text },
});
