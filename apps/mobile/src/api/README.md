# 경로 요청

## 역 검색

`stations.ts`의 `searchStations(apiBaseUrl, query, signal)`은 `GET /stations?q=...`를 호출한다. 응답의 역 ID·이름·호선 형식을 검사하고 역 배열을 반환한다. `StationPicker`는 출발·도착에 같은 컴포넌트를 사용하며, 입력 후 300ms에 검색하고 이전 요청을 취소한다. 취소가 늦어져도 이전 결과를 표시하지 않는다. 결과 선택 후 입력을 수정하면 선택된 역 ID를 초기화한다.

`apps/mobile/.env.local`에 `EXPO_PUBLIC_API_URL=http://개발PC의LAN주소:8000`을 지정한다. `.env.example`의 IP는 예시다. 서버 URL은 공개 설정이며 Supabase 키를 여기에 넣지 않는다. 설정 변경 후 앱을 전체 Reload한다. Wi-Fi 주소가 바뀌면 이 값도 수정한다.

개발 모드 콘솔에는 `[stations:input]`, `[stations:request]`, `[stations:response]`, `[stations:results]`, `[stations:selected]`, 실패 시 `[stations:error]`가 출력된다. 운영 모드에서는 출력하지 않는다. Docker의 Uvicorn 접근 로그에는 `GET /stations?q=...`가 표시된다. `/metrics`는 이 검색 흐름에서 호출하지 않는다.

## 경로 요청 함수

`routes.ts`의 `requestRoute(apiBaseUrl, originStationId, destinationStationId)`는 `POST /routes`를 호출하고 응답 데이터를 반환한다. HTTP 실패는 서버의 문자열 `detail` 또는 상태 코드가 포함된 오류를 던진다. 네트워크 오류와 성공 응답의 JSON 파싱 오류도 호출부로 전달한다. 로딩·오류 표시·중복 클릭 방지는 화면에서 처리한다.

`StationSelectionScreen`의 길 찾기 버튼은 선택된 출발·도착 역 ID로 이 함수를 호출한다. 두 역 미선택·동일 역·요청 중에는 버튼이 비활성화되고, 요청 중에는 역 입력도 잠근다. 대기 중에는 버튼에 로딩 스피너와 문구를 표시한다. 완료율을 알 수 없으므로 퍼센트를 표시하지 않는다.

성공하면 응답을 `RouteSessionProvider`의 공유 상태에 저장한 뒤 `/guide`로 이동한다. `GuideScreen`은 카메라와 현재 노드 → 다음 노드 안내 카드를 표시한다. 노드 진행 시 엣지 안내와 목표가 함께 바뀐다. 실패하면 역 선택 화면에 남아 오류를 표시한다. 선택을 변경하면 이전 결과를 지운다. 상태는 메모리에만 보관하며 경로 없이 안내 화면에 진입하면 역 선택으로 이동한다. 첫 시작 화면은 `LandingScreen`이다. 카메라 위의 나침반 표시는 연결했지만 실제 위치·방향 추정과 자동 도착 판정은 TODO다. 개발 콘솔에는 `[routes:request]`, `[routes:response]`, `[routes:error]`가 표시된다.

방향 계산·카메라 위 나침반의 입력·출력과 팀별 TODO는 [방향 계산 연결부](../navigation/README.md)를 참고한다.

호출 예시는 다음과 같다. `apiBaseUrl`은 호출부에서 정한 서버 주소다.

```typescript
import { requestRoute } from './routes';

async function handleRoutePress() {
  try {
    const route = await requestRoute(apiBaseUrl, 'ilwon', 'hakyeoul');
    // TODO: route를 화면 상태에 저장하고 경로 목록을 표시한다.
  } catch (error) {
    // TODO: 요청 실패를 화면에 표시한다.
  }
}

// 버튼 연결: onPress={handleRoutePress}
```

현재 mock API는 일원(`ilwon`) → 학여울(`hakyeoul`)만 지원하며 양쪽 출구는 1번으로 고정이다. 역 이름 대신 역 ID를 전달한다. 화면을 연결할 때 예시 상수 대신 사용자가 선택한 역 ID를 넘긴다.

서버 주소에는 `/routes`를 붙이지 않는다. 실제 휴대폰에서는 `localhost`가 휴대폰 자신을 뜻하므로 같은 네트워크에서 접근 가능한 개발 PC의 LAN 주소(예: `http://192.168.0.10:8000`)를 사용한다. 백엔드는 `--host 0.0.0.0`으로 실행해야 하며, 위 IP는 예시이므로 실제 PC 주소로 바꾼다.

`RouteResponse`는 현재 `contracts/examples/route.json`에서 타입만 가져온 초안이며 JSON 파일 자체를 앱에 포함하지 않는다. 런타임 응답 스키마 검증은 하지 않는다. 지도별 필드 등 타입은 예시 내용에 종속되므로 API 형식이 바뀌면 함께 조정한다. 지도 파일 다운로드, 위치 추적, 화면·버튼은 이 함수에 포함하지 않는다.
