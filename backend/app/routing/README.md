# 경로 계산

`POST /routes`는 역 ID 두 개만 받고, 서버가 노선·방향·추천 문 번호와 승강장까지의 보행 경로를 계산한다. 실측 문 좌표 파일은 이 MVP에 필요하지 않다. 현재 공식 순서가 등록된 **직통 3호선**만 지원한다. 역 ID를 순서나 방위로 해석하지 않는다. 다른 호선·순환선·지선 및 환승은 미지원 사유를 반환한다.

| 파일·함수 | 역할 |
| --- | --- |
| `transit.py:resolve_trip` | `search_stations()`로 ID를 정확히 조회하고, 공식 3호선 순서로 상하행·출발역의 다음 역·도착역의 다음 역 결정 |
| `grid.py:load_map` | 격자 읽기·SHA-256·보행 연결 구성. 로컬과 Render Storage 분기 |
| `grid.py:read_map_file` | 지도와 문 좌표 파일의 공통 읽기. 경로 조작 파일명 거부 |
| `public_data.py:get_fast_exit_rows` | 빠른하차 API의 전체 페이지를 읽고 역·방면·문·연결 설비 필드 보존 |
| `stations/service.py:get_platform_poi_id` | DB에서 역·호선·상하행에 해당하는 승강장 POI ID 조회 |
| `places.py:platform_access` | DB가 지정한 승강장 POI의 연결된 보행 영역과 1번 출구까지 가장 가까운 진입 노드·계단 POI 찾기 |
| `places.py:door_nodes` | 지도 버전·역·호선·상하행·출처 확인 후, 문이 실제로 포함된 칸과 높이에서 노드 찾기. 벽을 가장 가까운 보행 칸으로 바꾸지 않음 |
| `boarding.py:fast_exit_doors` | 도착역·호선·상하행·다음 역을 정확히 필터링하고 문 번호를 숫자순으로 정렬. 첫 후보를 추천 |
| `service.py:find_route` | 위 흐름 연결, `build_leg()`로 두 구간 계산, `trip` 및 `legs` 반환 |
| `field.py` | 역방향 Dijkstra·벽 가림 검사·3m 앞보기 화살표 계산 |

출발·도착 출구는 1번 출구다. 각 구간의 `platform`은 `id`, `name`, `access_name`(가까운 계단 POI 이름), `nodes`(노드 ID Int32 LE base64)다. 노드 ID는 지도 `cells` 배열 인덱스이며 칸 번호가 아니다.

승강장 POI의 높이에서 0.3m 이내로 연결된 보행 칸을 `platform_nodes()`로 찾는다. 출구 거리장에서 가장 가까운 영역 노드가 진입점이다. 출발역 화살표는 영역 안쪽의 승강장 POI를 향하며 앱이 영역 진입을 확인하면 먼저 종료한다. `origin_walk_m`은 POI까지의 계획 거리다. 승강장 방면은 지도나 코드에서 추정하지 않는다. 서버가 `station_platforms` DB에서 `(station_id, line_name, up_down)`에 해당하는 `platform_poi_id`를 읽고, 지도에서 해당 POI를 정확히 선택한다. 단일 승강장도 DB에 양방향 연결을 명시해야 한다. DB 연결 누락은 422, 지도에 없는/중복된 POI ID도 422로 거부한다. 조회는 요청마다 수행하므로 DB에서 변경하면 다음 요청부터 반영된다.

DB 테이블·초기 데이터는 `infra/supabase/migrations/20261120220000_create_station_platforms.sql`이다. 서버 배포 전에 Supabase SQL Editor 또는 CLI 마이그레이션 절차로 적용한다. 홍제 공용 승강장, 사용자가 확인한 잠원 연결, 사용자 승인 하에 도면·방위로 추론한 경찰병원 연결을 SQL 데이터로 등록한다. 경찰병원 연결은 현장 검증 전이며 근거는 DB `source`에 기록한다. 이후 역을 추가할 때 서버 코드를 변경하지 않고 DB 행만 등록한다. 자세한 SQL 변경 예시는 `infra/README.md`를 참고한다.

모바일 흐름: `legA → platformA → onTrain → platformB → legB → arrived`. 추적 중인 위치가 실제 승강장 노드에 포함되고 높이 차가 0.35m 이내일 때 `platformA`로 전환한다. 같은 층 또는 목표 반경 안이라는 이유만으로 전환하지 않는다. 탑승은 “탔어요”, 하차는 “내렸어요”로 확인한다.

도착역은 열차 이동 후 절대 위치를 자동으로 복구하지 못하므로, 반환된 계단 POI 앞에서 올라가는 방향을 바라보고 “계단 앞에서 안내 시작”을 눌러 위치 추정기를 재설정한다. 지도에 붙인 계단 번호는 현장 표지와 대조해야 한다. 문에서 해당 계단 앞까지의 자동 보행 유도는 없다. 문 후보는 출구·설비 좌표와 연결되지 않았으므로 1번 출구의 최단 문을 보장하지 않는다.
 열차 내부를 걷거나 환승하는 경로는 계산하지 않는다. 결과를 영구 캐시하지 않아 좌표·빠른하차 정보 수정은 다음 요청에 반영된다.

## 공식 근거와 실제 API 검증

- 노선 순서: [서울시 공식 수도권 노선도](https://japanese.seoul.go.kr/wp-content/uploads/2025/08/cliamte-card-service-availability.pdf), 2025-08 자료. 사용 범위는 직통 3호선이며 다른 노선으로 추정 확장하지 않는다.
- [공공데이터포털 빠른하차 명세](https://www.data.go.kr/data/15143840/openapi.do): `GET https://apis.data.go.kr/B553766/inout/getFstExit`. `serviceKey`, `dataType=JSON`, `pageNo`, `numOfRows`, `lineNm`, `stnNm` 사용. 역명·호선 검색은 포함 검색이므로 최종 후보는 정확히 다시 필터링한다.
- 실제 호출 확인: 2026-11-20, 홍제·잠원 각각 10행. `response.header.resultCode="00"`, `response.body.items.item`, `pageNo`, `numOfRows`, `totalCount` 구조를 확인했다.
- 필드: `stnNm`, `stnCd`(선행 0 유지), `lineNm`, `upbdnbSe`, `drtnInfo`, `qckgffVhclDoorNo`, `plfmCmgFac`, `facNo`, `elvtrNo`, `fwkPstnNm`, `facPstnNm`.
- `drtnInfo`는 종착역이 아니라 인접 방면역이다. 홍제 하행은 무악재, 상행은 녹번. 잠원 하행은 고속터미널, 상행은 신사였다. 모바일의 `direction`도 출발역의 인접 방면역을 의미하며 단축 운행 여부까지 보장하지 않는다.
- 잠원 하행 후보는 계단 `2-3`, `4-2`, `7-1`, `8-4`, 엘리베이터 `8-2`였다. 이 API는 문 번호와 연결 설비 정보를 주지만 우리 지도 좌표의 `x,z,h`는 주지 않는다.
- 키는 서버 환경 변수 `DATA_GO_KR_SERVICE_KEY`에만 설정한다. 인코딩된 키도 한 번 해제한 뒤 query encoding한다. 에러 응답에는 인증키나 원본 요청 URL을 넣지 않는다. 테스트는 Mock만 사용한다.

## 향후 문까지 최적화할 때만 필요한 실측 데이터

로컬: `data/maps/hongje.doors.json`, `data/maps/jamwon.doors.json` (`MAP_DIR` 변경 가능).
Render(`RENDER=true`): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `STORAGE_BUCKET`(기본 `station-maps`)으로 버킷 루트의 동일 파일을 읽는다. 지도 파일 이름은 `{station_id}.json`이다. 서버 비밀 키는 `apikey` 헤더에만 사용한다.

파일 구조(아래 좌표값은 **의도적으로 null이며 실행 가능한 실측 데이터가 아니다**):

```json
{
  "station_id": "hongje",
  "map_revision": "현재 hongje.json 원본 바이트의 SHA-256",
  "profiles": [
    {
      "line_name": "3호선",
      "up_down": "하행",
      "next_station": "무악재",
      "position_reference": "train-car-door",
      "verified": false,
      "source": "공식 도면·실측 기록의 URL 또는 문서/측정 식별자",
      "positions": {
        "4-2": { "x": null, "z": null, "h": null }
      }
    }
  ]
}
```

필요한 추가 작업:

1. 역별·방면별 승강장에서 실제 차량 번호와 출입문 번호를 확인한다. 양쪽 역에서 같은 `칸-문`이 같은 열차 위치를 뜻해야 한다. 반대 방향 승강장의 좌표를 재사용하지 않는다.
2. 각 문의 **사람이 서는 승강장 보행 바닥 위치**를 지도 좌표계로 측량/정합해 `x,z,h`(m)를 기록한다. 벽·선로 위의 좌표는 사용하지 않는다.
3. 지도 버전 해시와 공식 도면 또는 실측 근거를 기록한 후에만 `verified=true`로 지정한다. 이 플래그는 운영자의 검증 선언이며 코드가 현장 정확도를 증명하는 것은 아니다.
4. 잠원 하행 프로필의 `next_station`은 `고속터미널`, 역방향 프로필은 `신사`다. 홍제 상행은 `녹번`이다. 종착역에서 해당 방향의 다음 역이 없으면 JSON `null`을 사용한다.
5. 두 역에 공통으로 확인된 후보 문 좌표를 공급해야 한다. 일부 문만 등록하면 등록된 후보 안에서만 최적이며, 전체 후보의 전역 최적을 보장하지 않는다.

`choose_boarding_points()`·`load_door_positions()`는 향후 문까지 최적화할 때 재사용하도록 남겼다. 해당 함수는 문 자료 부족·검증 실패 시 거부하지만 현재 `/routes`는 호출하지 않는다. `door_1_1()` 추정점으로 대체하지 않는다. 이 함수는 지도 점검 도구/알고리즘 회귀 테스트에만 남아 있다.

## 응답과 오류

`trip`: 출발·도착 ID/역명, `line_name`, `up_down`, `direction`, `destination_next_station`, `door_no`, `origin_walk_m`, `destination_walk_m`.
`legs`: 출발역 1번 출구 → 승강장 POI(영역 진입 시 종료), 도착역 승강장 진입점 → 1번 출구. 보행거리는 문까지의 거리가 아니다.

- `404`: 등록되지 않은 역
- `422`: 잘못된 입력, 동일 역, 환승/미지원 노선, 승강장 방면 연결/진입점 부족, 방향 후보 없음, 연결 불가
- `503`: 지도 없음, Storage 설정/연결 실패, 공공데이터 키 없음, 역 DB 연결 실패
- `502`: 빠른하차 API 통신/업무 오류·응답 형식 오류·누락 페이지, 잘못된 지도/문 좌표 JSON

`tools/route-inspect/inspect_route.py`도 같은 서비스 경로를 사용한다. 실제 지도와 API/DB 설정·승강장 DB 행이 필요하며, 문 좌표 파일 없이 실제 승강장 경로를 생성한다.
