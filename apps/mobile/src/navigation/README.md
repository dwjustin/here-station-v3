# 이동 중 위치·화살표 (순수 로직)

방향·도착 계산은 이 폴더(`navigation/`), 위치 추적은 `../localization/`에 둔다.

센서·카메라·네트워크를 직접 쓰지 않는 순수 TypeScript 모듈이다. 화면(`screens/`, `components/`)은 이 함수들을 부르기만 한다. `apps/mobile`에서 `npm test`로 모두 검사한다.

좌표는 `x` 동(m), `z` 남(m), `h` 높이(m). 방위는 지도 북 0°, 시계 방향. 역마다 원점이 달라 구간(역)마다 따로 만든다.

## 모듈

| 파일 | 하는 일 |
| --- | --- |
| `../api/routes.ts` | `requestRoute`, `decodeLeg(leg)` → `DecodedLeg` (typed array) |
| `mapGrid.ts` | `createMapGrid(decodedLeg)` → `lookup(x, z, h)` 밟은 노드(벽·다른 층이면 `null`), `directionDeg(node)`, `nodeXZH(node)` |
| `guidance.ts` | `Pose` 타입, `createArrowStabilizer(grid)` → `(pose, t)` 화살표 회전각(1초 안 120° 넘는 뒤집힘은 1초 이어져야 바꿈, 구간마다 새로), `arrivedAt(pose, goal)`, `normalizeDeg` |
| `trip.ts` | `nextTripPhase(phase, event, goals)`: `legA → onTrain → legB → arrived`, `activeLegIndex(phase)` |
| `../localization/pdr.ts` | `motionSample(...)`: DeviceMotion → `MotionSample`. `createStepDetector().push(sample)` → 걸음(`Step`) 또는 `null` |
| `../localization/localizer.ts` | `createLocalizer(grid)`: 입자 필터. `reset`, `arFrame`, `step`, `pose()` |
| `../localization/virtualWalk.ts` | `virtualWalk(grid, leg, { arrowDeg, seed })`: 화면 화살표(`arrowDeg()`)를 보고 걷는 가상 보행자가 내보내는 `ArFrame` + 실제 위치(채점용). 테스트와 앱 개발 모드 "가상 보행"이 같이 쓴다 |

## 흐름

```text
ARKit 프레임(ArFrame) ─┐
DeviceMotion → pdr ────┤→ localizer(구간 격자 위 입자 필터) → pose
                       ▼
pose → mapGrid.lookup → 칸 방향(큰 뒤집힘은 1초 유지) − 카메라 방위 → 화살표 회전각
pose → trip: 구간 끝 도착이면 다음 단계, "내렸어요" 버튼 = alighted
```

- 구간 시작(`legA` 시작, `legB` 진입)에 `localizer.reset(leg.start, leg.start.heading_deg)`. 사용자는 화살표 방향을 보고 선다. 다음 AR 프레임의 방위가 이 방향이 되도록 `yawOffset`을 정한다.
- AR 추적이 `normal`이면 AR 이동량을 쓰고, `limited`·`notAvailable`이거나 1초 넘게 프레임이 없으면 PDR 걸음으로 움직인다. PDR 방위는 AR이 정상일 때 들어온 걸음에서 배운 (지도 방위 − 기기 방위)를 더한다.
- 입자가 보행 칸이 아닌 곳(벽)에 들어가면 버리고, 남은 입자를 다시 뽑는다. 한 칸(0.25m)보다 긴 이동(PDR 걸음)은 0.125m 간격으로 경로를 밟아 1칸짜리 벽·난간을 건너뛰지 못하게 한다. AR 프레임 이동은 그보다 짧아 끝점만 본다.
- 출발 때 화살표를 보고 선 방향은 수 ° 틀린다. 입자마다 방위 치우침(표준편차 8°)을 따로 두어 벽이 맞는 치우침만 남기게 하고, 화면 카메라 방위에도 그 평균을 더한다.
- 높이는 모든 입자가 같은 AR 높이(`AR y + hBase`, 첫 AR 프레임에서 추정 바닥에 맞춤)를 쓴다. 바닥 높이와 0.35m(서버 `MAX_STEP_CM`) 넘게 어긋난 입자는 버린다(계단을 오르는데 평지에 있는 입자, 겹친 다른 층·난간 윗면 입자). AR 높이 표류는 이동 1m당 0.2 비율로 살아남은 입자 바닥 평균 쪽으로 `hBase`를 고친다(실기기 보정 필요). 입자가 모두 버려지면 `hBase`를 추정 바닥에 다시 맞춘다. PDR 걸음은 옮긴 칸의 바닥 높이를 그대로 따른다.
- `onTrain`·`arrived`에서는 위치를 넣지 않는다(열차 = 기억상실 구간).

## 담당 작업

- 위치 추적 팀: `../localization/*`(입자 필터, PDR, 가상 보행), 실제 `pose` 공급, AR·지도 방위와 높이 정렬, 추적 끊김·다른 역·층 처리, `trip.ts`·`arrivedAt`(구간 전환·도착 판정, 열차 = 기억상실 구간. 도착 반경은 경로 응답의 `goal.arrival_radius`).
- 프론트 팀: `../components/ArView.tsx`(AR 카메라)와 `../screens/GuideScreen.tsx` 화면 배치. 화살표(`../components/CompassArrow.tsx`)는 위치 추적 팀이 맡는다.

응답 형식은 [공유 형식](../../../../contracts/README.md)을 따른다.

## 입력 형식

```typescript
type ArFrame = { t: number; x: number; y: number; z: number; // s, ARKit 월드 m (x 오른쪽, y 위, z 뒤)
  yawDeg: number; // AR 월드 카메라 방위, AR -z에서 시계 방향
  tracking: 'normal' | 'limited' | 'notAvailable' };
type MotionSample = { t: number; accZ: number; headingDeg: number }; // 수직 가속도 m/s²(중력 제외), 기기 방위
type Step = { t: number; lengthM: number; headingDeg: number };
type Pose = { position: { x: number; z: number; h: number }; cameraHeadingDeg: number | null;
  trackingStatus: 'tracking' | 'unavailable' };
```

`ArFrame.t`와 `MotionSample.t`는 같은 시계(초)여야 한다. 시뮬레이터·테스트는 같은 형식의 가짜 데이터를 넣는다.

가상 보행 테스트(`../localization/virtualWalk.test.mjs`)는 `data/route-hongje-jamwon.json`(gitignore)이 있으면 홍제 출구 → 1-1 → (열차) → 잠원 1-1 → 출구를 여러 seed로 걷고 도착률·오차를 출력한다. 보행자는 localizer 추정으로 그린 화살표만 보고 걷는다. 없으면 건너뛴다. 만들기: `backend/.venv/bin/python tools/route-inspect/inspect_route.py`.

## 아직 안 한 것

- 걸음 길이 계수(`WEINBERG_K`)와 걸음 문턱값은 실기기에서 보정해야 한다.
- ARKit(ViroReact `components/ArView.tsx`)·`expo-sensors`(`localization/usePdrSteps.ts`) 연결은 실기기에서 확인하지 않았다. 확인할 것: AR 방위 부호, DeviceMotion 수직 가속도 부호(Android), 걸음 방위.
- 가상 보행은 AR이 늘 `normal`인 경우만 본다. PDR 대체·추적 끊김은 합성 통로 테스트(`../localization/localizer.test.mjs`)만 있다.
- 60 seed에서 홍제 60/60, 잠원 59/60 도착(seed 28 미도착, 테스트 20 seed는 모두 도착): 추정이 1m 넘게 어긋난 채 벽 앞에 서면 화살표가 벽 쪽을 가리켜 제자리를 맴돈다.
- 1초 뒤집힘 유지는 120° 넘는 진짜 꺾임도 1초 늦춘다. 60 seed 실제 칸 방위와 90° 넘게 틀린 화살표 비율: 홍제 0.50% → 1.34%(나빠짐), 잠원 1.98% → 1.46%.
- 넓은 승강장에서 출발하면 폰 방위 오차(3~12°)를 벽에 부딪혀 배우기 전까지 좌우 오차가 1m 남짓 쌓인다(잠원 처음 30초 화살표 오차 p90 약 20°). 출발 방위 치우침 폭을 넓혀도 나아지지 않았다. 실기기에서 실내 나침반 오차를 재 보고 출발 방위 보정에 쓸지 정한다.
- shortcut: 앱 개발 모드 "가상 보행"은 화살표만 보여 주고 위에서 내려다본 디버그 지도(거리장 화살표 + 내 점)는 없다, 대신 `tools/route-inspect/inspect_route.py`의 PNG로 본다. 시뮬레이터에서 추정이 어긋나는 곳을 눈으로 봐야 할 때 화면에 붙인다.
