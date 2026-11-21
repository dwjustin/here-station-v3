# 경로 계산

`POST /routes`는 사용자가 선택한 두 역 ID를 받아 v2의 경로 계산을 실행한다. `contracts/examples/route.json`을 읽지 않는다. 현재 공식 순서가 등록된 **직통 3호선**을 지원하며, 출발·도착 출구는 1번이다. 환승·다른 호선은 422로 거부한다.

1. `transit.resolve_trip`: DB에서 역 ID를 정확히 확인하고 공식 3호선 순서로 상하행·인접 방면역을 결정한다.
2. `grid.load_map`: 두 역의 보행 지도를 읽고 SHA-256 지도 버전과 보행 그래프를 구성한다.
3. `public_data.get_fast_exit_rows`: 공공 빠른하차 API의 모든 페이지를 읽는다. `boarding.fast_exit_doors`가 도착역·호선·상하행·다음 역을 정확히 필터링하고 번호순 첫 문을 추천한다.
4. `stations.service.get_platform_poi_id`: DB의 `(station_id, line_name, up_down)`으로 승강장 POI를 선택한다. 단일 승강장도 양방향 연결을 명시해야 한다.
5. `places.platform_access`: 승강장과 연결된 보행 영역·출구 연결 진입점·가까운 계단을 찾는다.
6. `field`: 역방향 Dijkstra와 벽 가림 검사를 사용해 출발역 출구 → 승강장, 도착역 승강장 진입점 → 출구의 방향장을 계산한다.

문 좌표는 사용하지 않는다. 추천 문은 1번 출구까지 최단 보행을 보장하지 않으며, `origin_walk_m`·`destination_walk_m`도 문까지의 거리가 아니다. 도착역 계단 앞까지의 위치 이동은 사용자가 확인한다.

## 실행 데이터

- 로컬 기본 지도: 저장소 루트 `data/maps/{station_id}.json`. `MAP_DIR`로 변경 가능하다. 실제 지도는 Git에서 제외한다.
- `RENDER=true`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STORAGE_BUCKET`(기본 `station-maps`)으로 비공개 Storage의 `{station_id}.json`을 읽는다. v2의 버킷 루트 파일명을 사용하며, 아직 `station_maps.map_path`를 조회하지 않는다.
- 지도 형식: `id`, `x0`, `z0`, `w`, `cell`, `levels`, `pois`, `nodes.cell`(Int32 LE base64), `nodes.h`(Int16 LE cm base64). `pois`에는 1번 출구(`kind=exit`, `exitNo="1"`), 승강장(`kind=platform`, DB와 일치하는 `id`), 연결 계단(`kind=stairs`, `name`)과 `x,z,h`가 필요하다.
- 승강장 연결: [v2에서 가져온 마이그레이션](../../../infra/supabase/migrations/20261120220000_create_station_platforms.sql). 기존 v2 DB에 이미 적용했다면 재실행하지 않는다. 새 DB는 기존 migrations 다음에 적용한다. 경찰병원 방면 연결은 도면 추론이며 현장 검증 전이다.
- `DATA_GO_KR_SERVICE_KEY`: 서버 전용 공공데이터 API 키. 앱에 넣지 않는다.

## 응답과 오류

`trip`은 역 ID·이름, 호선·상하행·인접 방면역, 추천 문, 보행거리를 담는다. `legs`는 두 역의 지도 버전·격자·시작/목표·승강장 영역·칸별 방향장이다. 상세 형식은 [공유 형식](../../../contracts/README.md)과 `schemas.py`를 참고한다.

- 404: 등록되지 않은 역
- 422: 동일 역·환승·미지원 노선·승강장 연결 누락·보행 연결 불가·빠른하차 후보 없음
- 503: 지도 없음·스토리지/DB 연결 실패·공공데이터 키 없음
- 502: 잘못된 지도/DB/API 응답·공공 API 통신 오류

## 근거

- 노선 순서: [서울시 수도권 노선도, 2025-08](https://japanese.seoul.go.kr/wp-content/uploads/2025/08/cliamte-card-service-availability.pdf)
- 빠른하차: [공공데이터포털 명세](https://www.data.go.kr/data/15143840/openapi.do), `GET https://apis.data.go.kr/B553766/inout/getFstExit`

`drtnInfo`와 응답의 `direction`은 인접 방면역이며 종착역을 보장하지 않는다. 테스트는 합성 지도와 모의 외부 응답으로 실행한다.
