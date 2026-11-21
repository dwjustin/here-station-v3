import assert from 'node:assert/strict';
import test from 'node:test';

import { createStepDetector, motionSample } from './pdr.ts';

test('detects steps on a synthetic walking signal', () => {
  // 1.8 걸음/s, 진폭 2 m/s², 50Hz, 10초, 작은 고정 잡음
  const detector = createStepDetector();
  const steps = [];
  for (let i = 0; i < 500; i++) {
    const t = i / 50;
    const noise = 0.15 * Math.sin(i * 12.9898);
    const step = detector.push({ t, accZ: 2 * Math.sin(2 * Math.PI * 1.8 * t) + noise, headingDeg: 30 });
    if (step) steps.push(step);
  }
  assert.ok(Math.abs(steps.length - 18) <= 1, `steps ${steps.length}`);
  // Weinberg: 0.48 × (2 − (−2))^(1/4) ≈ 0.68m. 첫 걸음은 앞선 골이 없어 짧게 나오므로 뺀다
  for (const s of steps.slice(1)) {
    assert.ok(Math.abs(s.lengthM - 0.68) < 0.06, `length ${s.lengthM}`);
    assert.equal(s.headingDeg, 30);
  }
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i].t - steps[i - 1].t >= 0.3);
});

test('ignores small vibrations while standing', () => {
  const detector = createStepDetector();
  let count = 0;
  for (let i = 0; i < 200; i++) if (detector.push({ t: i / 50, accZ: 0.3 * Math.sin(i), headingDeg: 0 })) count++;
  assert.equal(count, 0);
});

test('motionSample: upright phone heading and vertical acceleration', () => {
  const R = Math.PI / 180;
  // 세운 폰(beta 90°), 위로 2 m/s². iOS 중력은 기기 −y(아래)
  const acc = { x: 0, y: 2, z: 0 };
  const withG = { x: 0, y: 2 - 9.81, z: 0 };
  const north = motionSample(0, acc, withG, { alpha: 0, beta: 90 * R, gamma: 0 });
  assert.ok(Math.abs(north.accZ - 2) < 1e-9);
  assert.ok(Math.abs(north.headingDeg) < 1e-6, `${north.headingDeg}`);
  // alpha는 반시계 → 90°면 서쪽(270°)
  const west = motionSample(0, acc, withG, { alpha: 90 * R, beta: 90 * R, gamma: 0 });
  assert.ok(Math.abs(west.headingDeg - 270) < 1e-6, `${west.headingDeg}`);
});
