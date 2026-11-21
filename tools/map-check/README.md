# 지도 점검

GLB → JSON 팀이 지도(`data/maps/<역>.json`)를 넘기기 전에 돌리는 점검 도구다. 서버는 지도를 고치지 않고 그대로 쓰므로(높이차 0.35m 이하만 잇는다) 여기서 나온 `WARN`·`FAIL`은 지도에서 고친다. 서버 경로 계산 코드(`backend/app/routing`)를 불러 같은 그래프로 본다. 표준 라이브러리만 쓴다.

```bash
backend/.venv/bin/python tools/map-check/check_map.py data/maps/hongje.json          # 지도만
backend/.venv/bin/python tools/map-check/check_map.py data/maps/hongje.json --walk   # 가상 보행 회귀까지
backend/.venv/bin/python -m unittest discover tools/map-check                        # 도구 자체 테스트
```

항목마다 `PASS`/`WARN`/`FAIL`, 개수, 가장 나쁜 곳 좌표 `(x, z, h)` m를 찍는다. `FAIL`이 하나라도 있으면 종료 코드 1이다.

| 항목 | 보는 것 | FAIL / WARN |
| --- | --- | --- |
| 1 형식 | 필수 필드, 격자 크기, 칸 수, 층, 출구 `exitNo`, 승강장·계단 POI | 필드·칸·출구·승강장 없음 / `exitNo`·계단 없음 |
| 2 연결 | 가장 큰 연결 덩어리 비율, 못 닿는 칸, POI가 큰 덩어리에 닿는지 | 출구·승강장·계단 POI가 덩어리 밖 / 큰 덩어리 95% 미만, POI와 칸이 1m 넘게 떨어짐 |
| 3 막힌 턱 | 2칸 안 높이 차 0.35~1.0m 쌍 중 그래프로 5m 넘게 돌아가는 곳. 맨 윗단이 낮게 스캔돼 막다른 계단 줄이면 높이를 고쳐 잇는다 | 있으면 WARN (난간·벽일 수도 있어 눈으로 확인) |
| 3b 가까운 겹층 | 같은 칸에 35cm~1m로 겹친 보행면(계단 단면이 여러 겹 등). 앱이 층을 헷갈려 화살표가 뒤집힌다 | 있으면 WARN, 겹 많은 순 좌표 |
| 4 막다른 띠 | 한쪽만 다른 높이와 닿아 0.5m 넘게 뻗은 좁은 같은 높이 띠(계단 옆 난간 윗면 등). 걸을 수 없으면 지도에서 뺀다 | 있으면 WARN |
| 5 화살표 | 오금 방면 설정(`places.OGEUM_BOUND`)이 있으면 출구 → 1-1, 없으면 출구 → 승강장마다 거리장을 만들어 방향 없는 칸 비율, 서로 마주 보는 이웃 쌍, 0.5m 앞이 벽인 화살표 | 출발 출구가 목적지와 끊김 / 방향 없는 칸 2% 초과, 마주 보는 쌍, 벽 1% 초과 |
| 6 가상 보행 (`--walk`) | `apps/mobile`의 `npm test` 도착률 | 테스트 실패·npm 없음 / 도착률 줄 없음(고정 데이터 없어 건너뜀) |

`--walk`는 넘긴 지도가 아니라 고정 데이터 `data/route-hongje-jamwon.json`을 걷는다. 지도를 바꿨으면 먼저 `tools/route-inspect`로 다시 만든다.
