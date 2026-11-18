# Here Station v3

지하철역 실내 길안내 앱. 새 코드와 데이터 형식을 팀이 함께 정하기 위한 시작 레포지토리다.

## 기술과 역할

| 영역 | 기술 | 역할 |
| --- | --- | --- |
| 모바일 | React Native, TypeScript, Expo Development Build | 화면, 센서, 위치 추정, AR 안내 |
| API | Python, FastAPI, Pydantic | 역 정보, 지도 버전, 경로 계산 |
| DB | PostgreSQL (Supabase 예정) | 역·시설 정보, 지도 버전, 파일 경로 |
| 파일 | Supabase Storage 예정 | 지도 JSON, 원본 GLB, 표시가 필요한 GLB |

서버는 API 코드를 실행하는 환경이다. 위치 추정과 이동 중 화면 갱신은 모바일에서 처리한다. 층별 PNG는 사용하지 않는다.

## 폴더

| 경로 | 담당 |
| --- | --- |
| `apps/mobile/` | 모바일 앱 |
| `backend/app/` | API와 서버 경로 계산 |
| `tools/map-preprocess/` | GLB에서 보행 지도 추출 |
| `contracts/` | 팀이 합의할 API·지도 형식 |
| `infra/` | DB·스토리지·배포 설정 |
| `docs/` | 구조와 협업 방법 |

## 클론

```bash
git clone https://github.com/dwjustin/here-station-v3.git
cd here-station-v3
```

## 백엔드 실행

Python 3.11 이상이 필요하다.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- 상태 확인: http://localhost:8000/health
- API 문서: http://localhost:8000/docs

## 현재 들어 있는 것

폴더별 역할 문서, FastAPI 진입점과 `/health`, Docker 실행 파일이 있다. 모바일 앱, 위치 추정, A*, 실제 역 데이터, DB·스토리지 연결은 아직 구현하지 않았다. 기존 레포 코드는 옮기기 전에 담당 기능별로 검토한다.

먼저 [구조](docs/architecture.md), [협업](docs/contributing.md), [공유 형식](contracts/README.md)을 읽고 작업 브랜치를 만든다.
