# 공유 형식

실행 중인 역 검색·경로 응답 형식과 후속 합의 항목을 정리한다. FastAPI의 OpenAPI 문서와 모델을 함께 유지한다.

## 실행 흐름용 예시

[examples/route.json](examples/route.json)은 일원역 1번 출구에서 학여울역 1번 출구까지의 **과거 mock 경로 응답**이다. 현재 서버와 앱은 이 파일을 읽지 않는다. 원본 POI·좌표를 사용하지만 경로 연결은 검증하지 않았다. 형식과 사용 방법은 [예시 설명](examples/README.md)을 참고한다. 팀 구현에 맞춰 바꿀 초안이며, 전체 지도나 확정된 API 스키마가 아니다.

## 지도

- 역 ID, 지도 버전, 스키마 버전
- 좌표 원점, 축 방향, 거리 단위, 높이와 층의 관계
- 보행 영역과 연결 정보, 출구·계단·엘리베이터
- 원본 GLB 좌표와 지도 좌표의 관계
- 표시용 GLB가 있다면 그 파일과 지도 JSON의 관계

기존 `nav/core.js`는 `x,z`를 평면, `h`를 높이로 사용한다. 새 형식을 정할 때 기존 데이터와의 변환도 함께 정한다.

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

### 실제 경로 응답

`POST /routes` 요청은 `origin_station_id`와 `destination_station_id`다. ID는 1~100자의 문자·숫자·밑줄·하이픈이며 두 역은 달라야 한다. 현재 양쪽 1번 출구, 직통 3호선과 등록된 지도·방면별 승강장만 지원한다.

응답은 v2의 `{trip, legs}` 형식이다. 기존 mock의 `nodes`·`edges`·`maps`·`is_mock`은 반환하지 않는다. 서버 모델은 `backend/app/routing/schemas.py`, 앱 타입·런타임 검증은 `apps/mobile/src/api/routes.ts`다.

- `trip`: `origin_station_id`, `origin_station_name`, `destination_station_id`, `destination_station_name`, `line_name`, `up_down`, `direction`(출발역의 인접 방면역), `destination_next_station`(종점이면 null), `door_no`(칸-문), `origin_walk_m`, `destination_walk_m`.
- `legs`: 출발역 출구 → 승강장, 도착역 승강장 진입점 → 출구 순서의 두 구간. 각각 `station_id`, `map_revision`(지도 원본 SHA-256), `grid`(`x0,z0,w,cell`), `start`(`level,x,z,h,heading_deg`), `goal`(`level,x,z,h,arrival_radius`), `platform`(`id,name,access_name,nodes`), `cells`, `h`, `direction`을 담는다.
- `cells`: Int32 LE base64 칸 번호(행 × w + 열). 배열 인덱스가 노드 ID이며, 겹친 층은 같은 칸 번호를 가질 수 있다.
- `h`: 같은 순서의 Int16 LE base64 바닥 높이(cm).
- `direction`: 같은 순서의 Uint16 LE base64 방위(0..3599, 0.1° 단위, 지도 북 0° 시계 방향). 65535는 목적지 또는 연결되지 않은 칸이다.
- `platform.nodes`: 승강장 영역의 노드 ID Int32 LE base64.

좌표는 m, x=동·z=남·h=높이다. 추천 문은 API 후보의 번호순 첫 문이며 최단 문을 보장하지 않는다. 보행거리는 문까지의 거리가 아니다. 오류·지도 제공 방식은 [경로 계산](../backend/app/routing/README.md)을 참고한다.

### 후속 합의 항목

- 지도 버전과 파일 다운로드 주소 조회
- 출발 위치·출구·이동 조건을 지정하는 경로 요청
- 환승·다른 호선·실측 문 좌표를 이용한 최적화
- 지도 버전 불일치·추적 위치 부적합 처리

프론트와 서버는 같은 지도 버전을 사용한다. 변경 시 호출부·검증·테스트·이 문서를 함께 수정한다.
