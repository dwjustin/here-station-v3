# 경로 계산

A*와 그래프 조회 코드를 둘 곳이다. HTTP 처리와 알고리즘을 분리한다. API는 입력을 검사한 뒤 경로 함수를 호출한다.

현재 `service.py`의 `find_route(origin_station_id, destination_station_id)`는 일원 → 학여울에 `contracts/examples/route.json`을 반환하고, 지원하지 않는 조합에는 `None`을 반환한다. 이후 실제 알고리즘을 이 함수에 연결한다. 예시 경로는 실제 보행 가능성을 검증하지 않았다.

지도 버전별 그래프를 메모리에 보관하고, 이동 중 위치 추정은 모바일이 담당한다. API·지도 형식을 합의한 뒤 구현한다.
