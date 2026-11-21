# 방향 계산 연결부

`calculateCompassDirection.ts`는 위치 추정 팀이 구현할 순수 함수다. 센서·카메라·네트워크를 직접 사용하지 않는다. 현재는 TODO만 있으며 항상 `{ rotationDeg: null }`을 반환한다. 실제 방향 계산이 구현됐다는 의미가 아니다.

```text
실제 위치 추정 결과 + 현재 보행 구간의 목표
  → calculateCompassDirection(input)
  → { rotationDeg }
  → CompassArrow
  → 카메라/AR 화면 위의 오버레이
```

## 입력

```typescript
import type { CompassDirectionInput } from './calculateCompassDirection';

const input = {
  pose: {
    stationId: 'hakyeoul',
    mapRevision: '동일 지도 식별자',
    level: 'B2',
    position: { x: 0, z: -20, h: -6.05 },
    cameraHeadingDeg: 0,
    trackingStatus: 'tracking',
  },
  target: {
    stationId: 'hakyeoul',
    mapRevision: '동일 지도 식별자',
    level: 'B2',
    position: { x: 0.38, z: -29.63, h: -6.05 },
  },
  movementKind: 'walk',
} satisfies CompassDirectionInput;
```

예시 값은 함수 사용법 설명용이며 센서 관측값이 아니다. 좌표 단위는 m, `x`는 동쪽, `z`는 남쪽, `h`는 역 원점 기준 높이다. `mapRevision`은 같은 지도 데이터임을 확인할 식별자이며, 현재 `legs[].map_revision`의 지도 원본 SHA-256을 사용한다. 단순히 두 값이 같다고 좌표 정렬까지 완료되는 것은 아니다.

`cameraHeadingDeg`는 지도 북쪽을 0°로 한 시계 방향 각도다. 카메라가 바라보는 방향을 수평면에 투영한 값이며, 자기장 센서의 원시 방향이나 휴대폰 윗변의 방향을 그대로 넣지 않는다. 위치 추정 팀이 지도와 AR/카메라 좌표계를 정렬하고 신뢰할 수 있을 때 `trackingStatus: 'tracking'`을 전달한다. 카메라가 수직을 향해 수평 방향을 결정할 수 없거나 추적이 불확실하면 방향을 `null` 또는 상태를 `unavailable`로 전달한다. GPS 입력은 필요하지 않다.

## 출력

```typescript
{ rotationDeg: 0 }     // 카메라 정면
{ rotationDeg: 90 }    // 오른쪽
{ rotationDeg: -90 }   // 왼쪽
{ rotationDeg: null }  // 계산 미구현 또는 안내 불가: 화살표를 숨김
```

범위는 `[-180, 180)`이며 정규화는 위치 추정 팀이 구현한다. 카메라를 돌리거나 위치가 바뀌면 다시 계산한다. `CompassArrow`는 받은 각도를 화면상의 위쪽 화살표 회전에 적용할 뿐, 위치 추정이나 도착 판정을 하지 않는다.

## 담당 작업

- 위치 추정 팀: 함수의 TODO 구현, 실제 `pose` 공급, 카메라·지도 방향 정렬, 불확실한 입력과 서로 다른 역·지도·층 처리.
- 안내 팀: `arrival_radius`와 층·추적 상태를 고려한 도착 판정, 현재 구간과 다음 목표 갱신, 열차·계단 이동 정책. 도착 반경은 이 방향 함수에서 사용하지 않는다.
- 프론트 팀: 카메라/AR 뷰 위에 `CompassArrow`를 배치. 화면에 겹치는 나침반 UI이며, 3D 월드에 고정된 AR 앵커를 생성하는 컴포넌트는 아니다.

`GuideScreen`은 현재 보행 구간 `legs[0]` 또는 `legs[1]`의 목표를 함수에 전달한다. 실제 방향은 목표까지 직선을 가리키면 벽을 통과할 수 있으므로 위치 추정 연결 시 서버의 칸별 `direction`을 사용해야 한다. `pose`는 아직 `null`이므로 카메라 위에는 `방향 확인 중`을 표시한다. `GuideCamera`가 후면 카메라 미리보기와 나침반 오버레이를 담당하며, 카메라 권한·설정 이동·시작 실패와 화면 이탈/백그라운드 시 해제를 처리한다. 화면의 약 70%는 카메라, 나머지는 현재 구간 안내 카드다. 작은 화면이나 큰 글씨에서는 카드 안을 스크롤할 수 있다.

## 여정 단계와 카드 갱신

`advanceGuidance(phase, event)`는 다음 순서의 이벤트만 처리하고 중복·다른 순서 이벤트는 무시한다.

1. `originWalk` + `platformReached` → `platform`
2. `platform` + `boarded` → `onTrain`
3. `onTrain` + `alighted` → `destinationPosition`
4. `destinationPosition` + `positionConfirmed` → `destinationWalk`
5. `destinationWalk` + `exitReached` → `arrived`

현재 위치 추정 연결 전이므로 각 이벤트는 사용자 확인 버튼에서 발생한다. 출발역은 1번 출구에서 시작하고 도착역은 응답의 `platform.access_name` 계단 앞에서 올라가는 방향을 확인해야 한다. 자동 보행 도착을 연결할 때는 지도 버전·층·추적 상태를 확인하고, 출발역 승강장 도착은 `platform.nodes` 영역과 높이로, 출구 도착은 `goal.arrival_radius`로 판정한다. 열차 이동 후 도착역 위치는 따로 재설정해야 한다.

`apps/mobile`에서 `npm test`로 여정 단계·잘못된 이벤트·요청 ID 전달·응답 검증·승강장 영역 디코딩을 검사한다.

카메라 위의 표시 구조는 다음과 같다. 이 화면은 카메라 미리보기 위의 2D 나침반이며 월드 좌표에 고정된 3D AR은 아직 구현하지 않았다.

```tsx
<View style={{ flex: 1 }}>
  {/* 카메라 미리보기 */}
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <CompassArrow rotationDeg={direction.rotationDeg} />
  </View>
</View>
```

## 실기기 실행

`expo-camera`와 권한 설정을 추가했으므로 기존 개발 빌드는 Reload만으로 갱신되지 않는다. `apps/mobile`에서 지원되는 Node 버전으로 전환한 뒤 다시 빌드한다.

```bash
nvm use 24
npm run ios -- --device
```

첫 안내 화면에서 카메라 권한을 허용한다. 카메라·화살표 동작과 화면 비율은 실기기에서 확인해야 한다. 설정 변경으로 prebuild가 다시 필요하다면 SDK 58에서는 기존 네이티브 프로젝트를 유지하도록 `npx expo prebuild --platform ios --no-clean`을 사용한다. 개발 팀 ID는 기존 빌드 로그의 값으로 `app.json`에 보존했다.

함수의 입력·출력은 연결용 초안이다. 변경 시 호출부·화살표·이 설명을 함께 수정한다.
