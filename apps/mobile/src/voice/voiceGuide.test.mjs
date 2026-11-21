import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classify, createVoiceGuide, meansAlighted, phaseText } from './voiceGuide.ts';

const TRIP = {
  origin_station_id: 'hongje', origin_station_name: '홍제', destination_station_id: 'jamwon',
  destination_station_name: '잠원', line_name: '3호선', up_down: '하행', direction: '무악재',
  destination_next_station: '고속터미널', door_no: '4-2', origin_walk_m: 120, destination_walk_m: 90,
};

/** [t, rotationDeg] 목록을 차례로 넣고 나온 말만 [t, text]로 모은다 */
function run(guide, samples, phase = 'legA', distanceToGoalM = 50) {
  const out = [];
  for (const [t, rotationDeg] of samples) {
    const u = guide({ t, phase, rotationDeg, distanceToGoalM });
    if (u) out.push([t, u.text]);
  }
  return out;
}

test('classify splits the arrow angle into spoken directions', () => {
  assert.deepEqual([null, 0, 30, -45, 45, -90, 90, 136, -180].map(classify),
    ['lost', 'straight', 'straight', 'slightLeft', 'slightRight', 'left', 'right', 'back', 'back']);
});

test('a direction is spoken once it holds for 1 s, and wobble is ignored', () => {
  const guide = createVoiceGuide(TRIP);
  const samples = [[0, 5], [0.5, -40], [0.6, 3], [1.0, 2], [1.7, 4], [2.0, -2], [3, 0]];
  assert.deepEqual(run(guide, samples), [[1.7, '앞으로 계속 가세요.']]);
});

test('turn is repeated until the user turns, then straight is confirmed', () => {
  const guide = createVoiceGuide(TRIP);
  const samples = [[0, 0], [1, 0], [2, -90], [3, -90], [5, -90], [11, -90], [12, 10], [13.1, 5], [20, 5]];
  assert.deepEqual(run(guide, samples), [
    [1, '앞으로 계속 가세요.'], [3, '왼쪽으로 도세요.'], [11, '왼쪽으로 도세요.'], [13.1, '앞으로 계속 가세요.'],
  ]);
});

test('lost arrow asks to hold the phone after 4 s, at most every 15 s', () => {
  const guide = createVoiceGuide(TRIP);
  const samples = [[0, null], [3, null], [4, null], [10, null], [19, null]];
  const out = run(guide, samples);
  assert.deepEqual(out.map(([t]) => t), [4, 19]);
  assert.match(out[0][1], /휴대폰/);
});

test('near the leg goal is announced once', () => {
  const guide = createVoiceGuide(TRIP);
  assert.deepEqual(run(guide, [[0, 0], [1, 0]], 'legA', 8), [[0, '곧 승강장이에요.'], [1, '앞으로 계속 가세요.']]);
  assert.deepEqual(run(guide, [[2, 0], [3, 0]], 'legA', 5), []);
});

test('phase changes are announced with trip details and interrupt', () => {
  const guide = createVoiceGuide(TRIP);
  assert.equal(guide({ t: 0, phase: 'legA', rotationDeg: null, distanceToGoalM: 80 }), null);
  const train = guide({ t: 1, phase: 'onTrain', rotationDeg: null, distanceToGoalM: null });
  assert.equal(train.urgent, true);
  assert.match(train.text, /3호선 무악재 방면 열차를 타세요/);
  assert.match(train.text, /잠원역에서 4번 칸 2번 문으로 내리고/);
  assert.equal(guide({ t: 50, phase: 'onTrain', rotationDeg: null, distanceToGoalM: null }), null);
  assert.match(guide({ t: 60, phase: 'legB', rotationDeg: 0, distanceToGoalM: 90 }).text, /도착역 안내/);
  assert.equal(guide({ t: 90, phase: 'arrived', rotationDeg: null, distanceToGoalM: null }).text,
    '잠원역 1번 출구에 도착했어요. 안내를 마칠게요.');
  assert.match(phaseText('onTrain', undefined), /내렸어라고/);
});

test('meansAlighted recognizes how people say they got off', () => {
  for (const heard of ['내렸어', '방금 내렸어요', '이제 내려요', '도착했어', '다 왔어']) assert.ok(meansAlighted(heard), heard);
  for (const heard of ['', '아직이요', '몇 정거장 남았어']) assert.ok(!meansAlighted(heard), heard);
});
