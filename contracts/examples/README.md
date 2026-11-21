# 경로 응답 예시

`route.json`은 `POST /routes` 성공 응답과 같은 형식의 **합성 예시**다. 실제 역·노선·문 좌표가 아니다. 3x3칸(0.25m) 바닥의 왼쪽 위 → 오른쪽 아래 구간과 반대 구간 두 개 및 합성 `platform` 영역·`trip` 메타데이터로 구성했다. 구간은 `backend/app/routing/service.py`의 `build_leg()`로 만들었다. 형식 설명은 [공유 형식](../README.md#경로-응답)에 있다.

`tools/route-inspect/inspect_route.py`는 실제 홍제 → 잠원 응답을 `data/route-hongje-jamwon.json`(gitignore)으로 저장한다. 이제 실제 API/DB 설정과 양쪽 역의 승강장 POI 연결이 필요하다. 문 좌표 파일은 필요하지 않다. 모바일 가상 보행 테스트는 이 실제 응답 파일이 있을 때만 전체 여정을 검사한다.

예시 `direction`을 풀면 `[1350, 1534, 1800, 1166, 1350, 1800, 900, 900, 65535]`다. 칸 번호 0~8 순서이고, 목적지 칸(8)은 방향이 없다.
