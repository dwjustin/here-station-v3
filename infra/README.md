# 실행 환경과 데이터 서비스

실행 구성: FastAPI 컨테이너 + Supabase PostgreSQL + Supabase Storage.

Supabase에는 역 검색용 `stations`와 지도 메타데이터용 `station_maps`와 승강장 방면용 `station_platforms` 테이블, 비공개 `station-maps` 버킷이 있다. 스토리지에는 역 단위 지도 JSON과 GLB를 저장한다.

## 역과 지도

| 테이블 | 필드 |
| --- | --- |
| `station_platforms` | `station_id`(FK), `line_name`, `up_down`, `platform_poi_id`, `source`. 앞의 세 필드가 복합 PK |
| `stations` | `id`(문자열 PK), `name`, `lines`(호선 ID 배열) |
| `station_maps` | `id`(자동 생성 UUID PK), `station_id`(FK), `version`, `storage_bucket`, `map_path`, `glb_path`(선택) |

`station_maps.station_id`는 `stations.id`를 참조한다. 한 역에 여러 지도 버전을 등록할 수 있지만 `(station_id, version)`은 중복할 수 없다. 지도 레코드가 남은 역은 삭제할 수 없다. 이 유니크 제약의 인덱스로 역별 지도 조회도 지원한다.

`map_path`와 `glb_path`는 `storage_bucket` 안의 상대 경로이며 다운로드 URL이나 파일 내용이 아니다. 버킷 기본값은 `station-maps`다. 좌표계·노드·엣지는 지도 JSON에서 관리하고 검색 응답에 포함하지 않는다. 현재 지도 레코드는 비어 있으며 실제 파일 업로드와 버전 확인 후 등록한다. 현재 버전 선택과 지도 조회 API는 후속 작업이다.

초기 역은 일원(`ilwon`, 3호선), 학여울(`hakyeoul`, 3호선), 성수(`seongsu`, 2호선), 구의(`guui`, 2호선), 교대(`gyodae`, 2·3호선)다. 경로를 지원하는 홍제(`hongje`)·잠원(`jamwon`, 둘 다 3호선)은 `20261119120000_seed_hongje_jamwon.sql`에서 추가한다. 두 테이블 모두 RLS를 활성화하고 `anon`·`authenticated`의 직접 접근 권한을 제거했다. 서버의 `service_role`은 조회·등록·수정·삭제할 수 있다. 비밀 키를 모바일에 넣지 않는다.

테이블과 초기 역은 `supabase/migrations/20261119000000_create_stations_and_station_maps.sql`에 있다. 연결된 원격 프로젝트에 적용할 때는 `infra`에서 대상 프로젝트를 확인한 뒤 실행한다(Supabase CLI 3 기준).

```bash
npx supabase db push --remote --dry-run --skip-vault
npx supabase db push --remote --skip-vault
```

제약·권한 검사는 다음 명령으로 실행한다. 임시 레코드를 넣은 트랜잭션은 마지막에 롤백하므로 데이터가 남지 않는다.

```bash
npx supabase db query --remote --file supabase/checks/stations.sql
```

백엔드의 `Station`, `StationMap`은 `backend/app/stations/schemas.py`의 API 데이터 모델이며 ORM 모델이 아니다. `GET /stations`는 Supabase REST API로 `stations` 테이블의 검색용 필드만 조회한다. `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 백엔드 환경 변수로 주입한다. publishable 키에는 테이블 조회 권한이 없으며, 이를 위해 공개 권한을 부여하지 않는다. 지도 테이블·파일은 검색 시 읽지 않는다.

스토리지 경로 예시: `stations/ilwon/v1/map.json`. 지도 파일은 버전별로 보관한다. 파일을 업로드하고 검사한 뒤 DB의 현재 버전을 갱신한다.

Supabase 서버 비밀 키와 DB 비밀번호는 서버 환경 변수로 관리한다. 다운로드 권한과 공개 여부는 별도로 정한다.

백엔드 Docker 실행:

```bash
docker build -t here-station-api -f backend/Dockerfile .
docker run --rm --env-file .env -p 8000:8000 here-station-api
```

## 승강장 방면 데이터

`supabase/migrations/20261120220000_create_station_platforms.sql`을 서버 배포 전에 적용한다. Supabase SQL Editor에서 파일 전체를 실행하거나 위 CLI 마이그레이션 절차를 사용한다. 실제 DB에는 자동 적용하지 않는다.

새 테이블은 홍제·잠원·경찰병원의 양방향 연결을 초기 데이터로 넣고, 경찰병원 역 레코드가 없으면 추가한다. 경찰병원 방면은 사용자 제공 도면·좌표 추론에 따른 값이며 현장 검증 전임을 `source`에 기록했다. 기존 행은 덮어쓰지 않는다. RLS와 서버 전용 권한은 다른 역 테이블과 같다.

서버는 `(station_id, line_name, up_down)`으로 매 요청 조회하고 DB가 지정한 `platform_poi_id`만 지도에서 찾는다. 코드 상수·POI 방면 필드·승강장 개수로 대체하지 않는다. `line_name`은 API와 동일한 `3호선`, `up_down`은 `상행` 또는 `하행`이다. `platform_poi_id`는 실제 지도 JSON의 POI ID여야 한다. 지도 파일을 교체하면서 POI ID/배치가 바뀌면 DB 연결도 대조한다.

승강장 연결 수정 예시(SQL Editor에서 실행):

```sql
update public.station_platforms
set platform_poi_id = 'platform1', source = '확인한 도면 또는 현장 기록'
where station_id = 'policehosp' and line_name = '3호선' and up_down = '상행';

select station_id, line_name, up_down, platform_poi_id, source
from public.station_platforms
order by station_id, line_name, up_down;
```

새 역·방향은 같은 필드로 `insert`한다. DB 데이터 수정은 재배포·재시작 없이 다음 요청부터 반영된다. DB 행이 없으면 422, 조회 자체가 실패하면 503이며 임의의 승강장으로 안내하지 않는다.
