# 경로 확인

서버 경로 계산(`backend/app/routing`)의 결과를 사람이 눈으로 확인하는 개발용 도구다. 배포 흐름에는 쓰지 않는다.

```bash
backend/.venv/bin/python tools/route-inspect/inspect_route.py
```

홍제 → 잠원 응답을 `data/route-hongje-jamwon.json`(모바일 가상 보행 테스트의 고정 데이터)으로 저장하고, 구간별 디버그 PNG(`data/route-hongje.png`, `data/route-jamwon.png`)를 그린다. `data/`는 gitignore다.
