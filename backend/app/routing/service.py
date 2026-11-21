import json
from pathlib import Path
from typing import Any

ROUTE_EXAMPLE = Path(__file__).resolve().parents[3] / "contracts/examples/route.json"


def find_route(origin_station_id: str, destination_station_id: str) -> dict[str, Any] | None:
    # TODO: 출발·도착 역에 맞는 지도를 읽고 실제 경로 탐색 알고리즘을 호출한다.
    # shortcut: 예시 경로 한 개만 지원하며, 실제 지도 경로 탐색 구현 시 교체한다.
    with ROUTE_EXAMPLE.open(encoding="utf-8") as file:
        route = json.load(file)
    if (origin_station_id, destination_station_id) != (
        route["nodes"][0]["station_id"],
        route["nodes"][-1]["station_id"],
    ):
        return None
    return route
