# 실행 환경과 데이터 서비스

예정: FastAPI 컨테이너 + Supabase PostgreSQL + Supabase Storage.

DB에는 역·검색용 시설 정보, 지도 버전, 파일 경로와 좌표 기준을 저장한다. 스토리지에는 역 단위 지도 JSON과 GLB를 저장한다. 계정이나 클라우드 리소스는 아직 만들지 않았다.

스토리지 경로 예시: `stations/ilwon/v1/map.json`. 지도 파일은 버전별로 보관한다. 파일을 업로드하고 검사한 뒤 DB의 현재 버전을 갱신한다.

Supabase 서버 비밀 키와 DB 비밀번호는 서버 환경 변수로 관리한다. 다운로드 권한과 공개 여부는 별도로 정한다.

백엔드 Docker 실행:

```bash
docker build -t here-station-api ./backend
docker run --rm -p 8000:8000 here-station-api
```
