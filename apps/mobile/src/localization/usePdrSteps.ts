import { useEffect, useRef } from 'react';
import { DeviceMotion } from 'expo-sensors';

import { createStepDetector, motionSample, type Step } from './pdr';

/** DeviceMotion(50Hz) → 걸음 감지 → onStep. t는 ArView와 같은 performance.now() 초 */
export function usePdrSteps(enabled: boolean, onStep: (step: Step) => void) {
  const onStepRef = useRef(onStep);
  useEffect(() => { onStepRef.current = onStep; });

  useEffect(() => {
    if (!enabled) return;
    let subscription: { remove(): void } | null = null;
    let cancelled = false;
    // 시뮬레이터 등 센서가 없으면 걸음 없이 AR만 쓴다
    void DeviceMotion.isAvailableAsync().then((available) => {
      if (!available || cancelled) return;
      const detector = createStepDetector();
      DeviceMotion.setUpdateInterval(20);
      subscription = DeviceMotion.addListener((m) => {
        if (!m.acceleration || !m.rotation) return;
        const step = detector.push(motionSample(performance.now() / 1000, m.acceleration, m.accelerationIncludingGravity, m.rotation));
        if (step) onStepRef.current(step);
      });
    }, () => {});
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);
}
