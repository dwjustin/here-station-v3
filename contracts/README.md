# 공유 형식

아래 항목은 합의할 목록이며, 확정된 JSON 스키마나 구현된 API가 아니다.

## 예시

[examples/route.json](examples/route.json)은 경로 응답 형식의 작은 합성 예시다. 설명은 [예시 설명](examples/README.md)을 참고한다.

## 지도

- 역 ID, 지도 버전, 스키마 버전
- 좌표 원점, 축 방향, 거리 단위, 높이와 층의 관계
- 보행 영역과 연결 정보, 출구·계단·엘리베이터
- 원본 GLB 좌표와 지도 좌표의 관계
- 표시용 GLB가 있다면 그 파일과 지도 JSON의 관계

지도 JSON은 `x,z`를 평면, `h`를 높이로 사용한다.

## API

### 역 검색 초안

`GET /stations?q=검색어`는 `{"stations": [...]}` 형태를 반환한다. 검색어 생략·빈 검색어는 전체 목록, 일치하는 역이 없으면 빈 배열이다. 출발·도착에 같은 목록을 사용한다.

| 역 필드 | 타입 | 의미 |
| --- | --- | --- |
| `id` | 문자열, 1~100자 | 경로 요청에서 사용하는 역 ID. 이름이나 호선이 바뀌어도 유지 |
| `name` | 문자열, 1~100자 | 표시 이름. 예: `일원` |
| `lines` | 문자열 배열, 1개 이상 | 호선 ID 목록. 각 ID 1~20자. 예: `["3"]`, 환승역은 여러 개 |

실행되는 Pydantic 모델은 `backend/app/stations/schemas.py`에 있다. 이는 DB 테이블 정의가 아닌 API 데이터 모델 초안이며, 필요에 따라 예시·프론트 타입과 함께 변경한다.

### 지도 메타데이터 초안

`StationMap`은 `Station`과 별도 모델이다. `id`(UUID), `station_id`, `version`, `storage_bucket`, `map_path`, 선택값 `glb_path`를 담는다. 지도 좌표계·보행 격자·노드·엣지 전체는 지도 파일에 두며 역 검색 응답에 넣지 않는다. 지도 메타데이터 조회 API는 아직 없다.

DB의 `station_maps.station_id`는 `stations.id`를 참조하고 `(station_id, version)`은 유일하다. 실제 테이블 정의는 `infra/supabase/migrations/20261119000000_create_stations_and_station_maps.sql`이 기준이다. API 모델의 `Station.id`와 `StationMap.id`는 각각 문자열과 UUID로 서로 다른 식별자다.

### 경로 응답

`POST /routes`(요청 본문 `origin_station_id`, `destination_station_id`)는 `{"trip": {...}, "legs": [...]}`를 반환한다. 현재 공식 순서가 등록된 직통 3호선만 처리한다. 성공에는 두 역의 보행 지도와 방면별 승강장 연결이 모두 필요하다. 환승·다른 노선·승강장 연결 부족은 미지원 사유를 반환한다. 출발역 1번 출구 → 승강장 POI(영역 진입 시 종료), 도착역 승강장 진입점 → 1번 출구 두 구간이며, 열차 내부 안내 경로는 계산하지 않는다. 모델은 `backend/app/routing/schemas.py`, 실제 위치 자료 형식과 근거는 [경로 계산](../backend/app/routing/README.md)을 참고한다.

`trip` 필드:

| 필드 | 의미 |
| --- | --- |
| `origin_station_id`, `origin_station_name` | 출발역 ID·표시 이름 |
| `destination_station_id`, `destination_station_name` | 도착역 ID·표시 이름 |
| `line_name`, `up_down` | 선택 호선, API와 일치하는 상행/하행 |
| `direction` | 출발역에서 향하는 인접 방면역. 종착역 보장이 아님 |
| `destination_next_station` | 도착역에서 같은 방향으로 이어지는 인접 역. 종점이면 null |
| `door_no` | 도착역 방면에 맞는 API 후보 중 추천 칸-문 번호 |
| `origin_walk_m`, `destination_walk_m` | 출발역은 출구→승강장 POI 계획 거리, 도착역은 진입점→출구 거리(m) |

| 구간 필드 | 의미 |
| --- | --- |
| `station_id` | 역 ID |
| `map_revision` | 계산에 쓴 지도 파일 바이트의 SHA-256 (hex) |
| `grid` | `x0`, `z0`(격자 왼쪽 위 모서리 m), `w`(가로 칸 수), `cell`(칸 한 변 m) |
| `start` | `level`, `x`, `z`, `h`, `heading_deg`. 사용자는 이 위치에서 이 방위(출발 칸의 화살표)를 보고 선다 |
| `goal` | `level`, `x`, `z`, `h`, `arrival_radius`(m). 이 반경 안에 들어오면 구간 도착 |
| `cells` | 보행 칸 번호(행 x `w` + 열), Int32 LE base64. 지도 `nodes.cell`과 같은 값·순서 |
| `h` | 칸 바닥 높이(cm), Int16 LE base64. 같은 순서 |
| `direction` | 칸의 화살표 방위, Uint16 LE base64. 0.1° 단위 0~3599, `65535` = 방향 없음(목적지 칸, 닿을 수 없는 칸) |

- 좌표: `x` = 동쪽, `z` = 남쪽, `h` = 높이 (m, 역별 로컬). 방위는 지도 북 0°, 시계 방향: $\mathrm{bearing}(a \to b) = \mathrm{atan2}(b_x - a_x, -(b_z - a_z))$.
- 칸 찾기: 열 $= \lfloor (x - x_0)/\mathrm{cell} \rfloor$, 행 $= \lfloor (z - z_0)/\mathrm{cell} \rfloor$. 층이 겹치는 곳은 같은 칸 번호가 높이만 달리 여러 번 나오므로, 같은 칸 번호 중 `h`가 현재 높이에 가장 가까운 것을 고른다. 목록에 없는 칸, 가장 가까운 `h`도 1.0m 넘게 차이 나는 칸(겹친 다른 층)은 벽이다.
- 화면 화살표 = 칸 방위 − 카메라 방위. 칸 방위는 서버가 목적지까지 보행 거리가 줄어드는 쪽으로 경로를 3m 따라간 점(직선이 벽에 막히면 보이는 가장 먼 경로 점)을 향해 미리 계산한다.

### 후속 합의 항목

- 역 검색과 역 상세 조회
- 지도 버전과 파일 다운로드 주소 조회
- 경로 요청: 역 ID, 지도 버전, 출발 위치, 목적지, 이동 조건
- 경로 응답: 출구 선택(지금은 1번 출구), 실측 승하차 문 자료 확장, 엘리베이터, 칸 데이터 저장소 주소 전달
- 오류: 지도 버전 불일치, 출발 위치 부적합, 경로 없음

프론트와 서버는 같은 지도 버전을 사용한다. 확정된 HTTP 형식은 FastAPI의 OpenAPI 문서와 함께 관리한다.

각 구간의 `platform`은 승강장 `id`, `name`, 안내 재개용 계단 POI 이름 `access_name`, 영역 노드 ID 배열 `nodes`(Int32 LE base64)다. 문 번호 `door_no`는 방향에 맞는 API 후보 추천이며 출구별 최적 문을 보장하지 않는다. `origin_walk_m`은 출구→승강장 POI 계획 거리이며 앱은 영역 진입 시 먼저 멈춘다. `destination_walk_m`은 승강장 진입점→출구 거리다.

승강장 방면은 `public.station_platforms`의 `(station_id, line_name, up_down) → platform_poi_id` 연결로 관리한다. 서버는 이를 요청마다 조회한 후 지도 POI와 연결한다. 저장소에 새 지도를 올리거나 역만 등록해도 방면은 자동 생성되지 않는다. 연결 행이 없으면 422이며 단일 승강장도 예외가 아니다.
