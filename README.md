# Here Station v3

지하철역 실내 길안내 앱. 새 코드와 데이터 형식을 팀이 함께 정하기 위한 시작 레포지토리다.

v2의 모바일 안내·역 조회 구조를 바탕으로, 사용자가 선택한 출발·도착역의 지도로 실제 경로를 계산한다. 위치 추적과 카메라 방향 계산은 팀 연결용 TODO다.

## 기술과 역할

| 영역 | 기술 | 역할 |
| --- | --- | --- |
| 모바일 | React Native, TypeScript, Expo Development Build | 화면, 센서, 위치 추정, AR 안내 |
| API | Python, FastAPI, Pydantic | 역 정보, 지도 버전, 경로 계산 |
| DB | Supabase PostgreSQL | 역·시설 정보, 지도 버전, 파일 경로 |
| 파일 | Supabase Storage | 지도 JSON, 원본 GLB, 표시가 필요한 GLB |

서버는 API 코드를 실행하는 환경이다. 위치 추정과 이동 중 화면 갱신은 모바일에서 처리한다. 층별 PNG는 사용하지 않는다.

## 폴더

| 경로 | 담당 |
| --- | --- |
| `apps/mobile/` | 모바일 앱 |
| `backend/app/` | API와 서버 경로 계산 |
| `tools/map-preprocess/` | GLB에서 정보 추출 |
| `contracts/` | 팀이 합의할 API·지도 형식 |
| `infra/` | DB·스토리지·배포 설정 |
| `docs/` | 구조와 협업 방법 |

## 0. 공통: 프로젝트 설정

Node 24와 Docker Desktop을 준비한다. iOS는 Xcode 서명과 실기기 개발자 모드를 설정한다.

```bash
git clone https://github.com/dwjustin/here-station-v3.git
cd here-station-v3
```

루트 `.env.example`을 참고해 서버 `.env`를 설정한다. 모바일은 `apps/mobile/.env.local`에 `EXPO_PUBLIC_API_URL=http://개발PC의LAN주소:8000`을 지정한다. 실기기와 PC는 같은 Wi-Fi를 사용한다. 서버 비밀 키는 모바일에 넣지 않는다.

백엔드: Docker Desktop을 켠 뒤 프로젝트 루트에서 실행한다. 아래 로컬 실행 방법과 둘 중 하나만 사용한다.

```bash
docker compose -f infra/compose.yaml up --build
```

모바일: 별도 터미널에서 프로젝트 루트 기준으로 실행한다.

```bash
nvm install 24
nvm use 24
cd apps/mobile
npm ci
npm run ios -- --device
```

이후 개발 서버만 실행할 때는 `npm start`를 사용한다. API·좌표·입출력 형식은 초안이며, 변경 시 관련 팀과 공유하고 호출부도 수정한다.

`No script URL provided`가 뜨면 기기의 Debug 앱이 Mac의 Metro 개발 서버에서 JavaScript를 받지 못한 상태다. `expo-dev-client` 추가 전 설치한 앱은 아래 명령으로 네이티브 설정을 갱신한 뒤 다시 설치한다.

```bash
cd apps/mobile
npm ci
npx expo prebuild --platform ios --no-install
npm run ios -- --device
```

이후에는 `npm start`를 켜 둔 채 iPhone과 Mac을 같은 Wi-Fi에 연결하고, 개발 클라이언트에서 서버를 선택하거나 터미널의 QR 코드를 스캔한다. iPhone 설정에서 앱의 로컬 네트워크 접근을 허용한다. `.env.local`의 `EXPO_PUBLIC_API_URL`은 백엔드 주소이며 Metro 주소와 별개다.

Metro 없이 실행하려면 `apps/mobile`에서 `npm run ios:standalone`으로 JavaScript 번들을 포함한 Release 앱을 설치한다. 코드 변경은 다시 빌드해야 반영되며 API 서버 연결은 별도로 필요하다.

## 1. GLB → JSON 팀

- 전처리 코드: `tools/map-preprocess/`.
- 파일은 Supabase Storage의 비공개 `station-maps` 버킷에 저장한다.

| 파일 | 버킷 안의 경로 |
| --- | --- |
| 원본 GLB | `stations/{station_id}/{version}/source.glb` |
| 생성한 지도 JSON | `stations/{station_id}/{version}/map.json` |

좌표·층·보행 연결을 검증하고, 역 ID·버전·파일 경로를 팀장에게 전달해 `station_maps`에 등록한다. 형식은 `contracts/`를 기준으로 협의한다. 실제 GLB·전체 지도 JSON은 Git에 커밋하지 않는다.
contracts 바꾸게 되면 알려주세용(코드 반영해야됨.).

## 2. 위치 추적 팀

- 초기 위치·방향 설정, 센서 기반 추적·오차 보정, 추적 시작·종료를 구현한다.
- 추적 코드: `apps/mobile/src/localization/`에 추가한다.
- 방향 계산: `apps/mobile/src/navigation/calculateCompassDirection.ts`의 TODO를 구현한다.
- 연결: `apps/mobile/src/screens/GuideScreen.tsx`의 `pose`에 추정 결과를 전달하고, 실제 보행 도착 판정 후 `advanceGuidance`의 `platformReached`·`exitReached` 이벤트를 연결한다. 층·열차 이동과 추적 불가 상태도 처리한다.

입출력과 연결 예시: [방향·도착 처리](apps/mobile/src/navigation/README.md).

## 3. UI/UX 디자인 + 프론트엔드 팀

- 디자인을 통일하고 역 검색·로딩·오류·카메라 권한·길 안내 UX를 개선한다.
- 화면: `apps/mobile/src/screens/`.
- 공통 UI와 카메라·나침반: `apps/mobile/src/components/`.
- 색상·간격·글자 크기: `apps/mobile/src/theme/token.ts`.
- 기존 API 함수와 위치 추정 출력을 사용하고, 화면 표시와 계산 로직을 분리한다.

## 백엔드 실행

Python 3.11 이상이 필요하다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file ../.env
```

- 상태 확인: http://localhost:8000/health
- API 문서: http://localhost:8000/docs

### 역 검색

```bash
curl --get http://localhost:8000/stations --data-urlencode 'q=일원'
```

```json
{"stations":[{"id":"ilwon","name":"일원","lines":["3"]}]}
```

`GET /stations`는 등록된 역 전체를 반환한다. `q`는 최대 100자이며, 역 이름 또는 ID로 부분 검색한다. 앞뒤 공백과 영문 대소문자는 무시하고 `일원역`처럼 접미사 `역`을 붙여도 검색된다. 검색 결과가 없으면 `200`과 빈 `stations` 배열을 반환한다. 출발·도착 선택에 같은 API를 사용하며 도착역을 출발역에 따라 제한하지 않는다.

역 정보 모델은 `backend/app/stations/schemas.py`에 있다. `search_stations()`는 Supabase REST API를 통해 `stations` 테이블에서 `id`, `name`, `lines`만 조회하며 DB에서 검색한다. 새 역을 테이블에 등록하면 다음 검색에 반영된다. 원본 지도 파일을 업로드하는 것만으로 역이 자동 등록되지는 않는다. 검색 목록과 실제 경로 탐색 지원 범위는 별개다. 직통 3호선 중 양쪽 지도와 방면별 승강장 연결이 있는 역 조합을 지원한다.

루트 `.env`의 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`가 필요하다. `SUPABASE_SECRET_KEY`에는 서버 전용 secret 키를 사용하며 publishable 키를 넣지 않는다. 로컬 실행 시 위의 `--env-file ../.env`로 읽고, Docker Compose는 `env_file`로 주입한다. 연결 설정 누락·DB 연결 실패는 `503`, 잘못된 DB 응답은 `502`를 반환한다. 키를 프론트에 전달하지 않는다.

### 경로 요청

```bash
curl -X POST http://localhost:8000/routes \
  -H 'Content-Type: application/json' \
  -d '{"origin_station_id":"hongje","destination_station_id":"jamwon"}'
```

선택한 역 ID로 노선·방면·추천 승차 문과 두 역의 실제 보행 방향장을 계산한다. 응답은 `trip`과 `legs`이며 기존 mock의 `nodes`·`edges`와 다르다. 출발·도착 출구는 1번이고 직통 3호선만 지원한다.

로컬 실행 전 v2 형식의 실제 지도 JSON을 루트 `data/maps/{station_id}.json`에 준비한다. Docker도 이 폴더를 읽기 전용으로 연결한다. 다른 폴더는 서버 `MAP_DIR`로 지정할 수 있다. 지도·비밀 키는 Git에 커밋하지 않는다. `RENDER=true` 환경에서는 기존 Storage 버킷 루트의 같은 파일명을 읽는다.

루트 `.env`에 `DATA_GO_KR_SERVICE_KEY`도 필요하다. DB에는 `station_platforms` 방면별 승강장 연결이 있어야 하며, v2에서 가져온 `infra/supabase/migrations/20261120220000_create_station_platforms.sql`을 새 DB에 적용한다. 기존 v2 DB에 적용된 경우 재실행하지 않는다. 지도 누락·외부 서비스 실패·미지원 여정은 오류를 반환하며 예시 경로로 대체하지 않는다.

앱은 출발역 보행 → 승강장 → 탑승 → 하차 후 계단 앞 위치 확인 → 도착역 출구 보행을 표시한다. 위치 추적 연결 전이므로 도착과 탑승·하차는 사용자 확인 버튼으로 진행한다. 추천 문은 빠른하차 후보의 번호순 첫 문이며 출구까지 최단 보행을 보장하지 않는다.

구현·설정·오류 코드는 [경로 계산](backend/app/routing/README.md), 응답 형식은 [공유 형식](contracts/README.md)을 참고한다.

백엔드 테스트는 `backend`에서 실행한다.

```bash
python -m pip install -e '.[test]'
python -m unittest discover -s tests
```

## 현재 들어 있는 것

DB 역 검색, 선택한 역의 실제 보행 경로 계산, 카메라와 안내 카드가 있다. 위치/방향 추정·자동 도착 판정·환승은 아직 구현하지 않았다. 기존 레포 코드는 담당 기능별로 검토해 가져온다.

먼저 [구조](docs/architecture.md), [협업](docs/contributing.md), [공유 형식](contracts/README.md)을 읽고 작업 브랜치를 만든다.
