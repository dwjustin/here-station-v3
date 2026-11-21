# 경로 요청

## 역 검색

`stations.ts`의 `searchStations(apiBaseUrl, query, signal)`은 `GET /stations?q=...`를 호출한다. 응답의 역 ID·이름·호선 형식을 검사하고 역 배열을 반환한다. `StationPicker`는 출발·도착에 같은 컴포넌트를 사용하며, 입력 후 300ms에 검색하고 이전 요청을 취소한다. 취소가 늦어져도 이전 결과를 표시하지 않는다. 결과 선택 후 입력을 수정하면 선택된 역 ID를 초기화한다.

`apps/mobile/.env.local`에 `EXPO_PUBLIC_API_URL=http://개발PC의LAN주소:8000`을 지정한다. `.env.example`의 IP는 예시다. 서버 URL은 공개 설정이며 Supabase 키를 여기에 넣지 않는다. Wi-Fi 주소가 바뀌면 이 값도 수정한다. iOS는 `app.config.js`에서 HTTP API 호스트에만 ATS 예외를 생성하므로, 호스트 변경 후 앱을 다시 빌드한다. Release 빌드는 서버 주소가 JS 번들에 포함되므로 주소 변경 시에도 다시 빌드해야 한다.

개발 모드 콘솔에는 `[stations:input]`, `[stations:request]`, `[stations:response]`, `[stations:results]`, `[stations:selected]`, 실패 시 `[stations:error]`가 출력된다. 운영 모드에서는 출력하지 않는다. Docker의 Uvicorn 접근 로그에는 `GET /stations?q=...`가 표시된다. `/metrics`는 이 검색 흐름에서 호출하지 않는다.

## 경로 요청 함수

`routes.ts`의 `requestRoute(apiBaseUrl, originStationId, destinationStationId)`는 `POST /routes`를 호출하고 응답 데이터를 반환한다. HTTP 실패는 서버의 문자열 `detail` 또는 상태 코드가 포함된 오류를 던진다. 네트워크 오류와 성공 응답의 JSON 파싱 오류도 호출부로 전달한다. 로딩·오류 표시·중복 클릭 방지는 화면에서 처리한다.

`StationSelectionScreen`의 길 찾기 버튼은 선택된 출발·도착 역 ID로 이 함수를 호출한다. 두 역 미선택·동일 역·요청 중에는 버튼이 비활성화되고, 요청 중에는 역 입력도 잠근다. 대기 중에는 버튼에 로딩 스피너와 문구를 표시한다. 완료율을 알 수 없으므로 퍼센트를 표시하지 않는다.

성공하면 응답을 `RouteSessionProvider`의 공유 상태에 저장한 뒤 `/guide`로 이동한다. 실패하면 역 선택 화면에 남아 오류를 표시한다. 선택을 변경하면 이전 결과를 지운다. 상태는 메모리에만 보관한다. 개발 콘솔에는 `[routes:request]`, `[routes:response]`, `[routes:error]`가 표시된다.

현재 서버는 홍제(`hongje`) → 잠원(`jamwon`)만 지원하고 나머지는 404다.

서버 주소에는 `/routes`를 붙이지 않는다. 실제 휴대폰에서는 `localhost`가 휴대폰 자신을 뜻하므로 같은 네트워크에서 접근 가능한 개발 PC의 LAN 주소(예: `http://192.168.0.10:8000`)를 사용한다. 백엔드는 `--host 0.0.0.0`으로 실행해야 하며, 위 IP는 예시이므로 실제 PC 주소로 바꾼다.

## 응답 형식과 `decodeLeg`

`RouteResponse = { legs: RouteLeg[] }`. 구간 0 = 홍제 1번 출구 → 오금 방면 `1-1`, 구간 1 = 잠원 `1-1` → 1번 출구. 각 구간은 `grid`(`x0`, `z0`, `w`, `cell`), `start`(`heading_deg` 포함), `goal`(`arrival_radius` 포함), base64 배열 `cells`·`h`·`direction`을 가진다. 좌표는 `x` 동, `z` 남, `h` 높이(m). 타입은 `routes.ts`에 직접 적었으며 `contracts/`의 스키마와 같이 바꾼다. 런타임 스키마 검증은 하지 않는다.

`decodeLeg(leg)`는 base64를 풀어 `cells: Int32Array`, `h: Int16Array`(cm), `direction: Uint16Array`(0.1° 단위, 65535 = 방향 없음)로 돌려준다. 세 배열 길이가 다르면 오류를 던진다. 칸 찾기·화살표는 [navigation](../navigation/README.md)을 본다.

```typescript
const route = await requestRoute(apiBaseUrl, 'hongje', 'jamwon');
const legs = route.legs.map(decodeLeg);
```
