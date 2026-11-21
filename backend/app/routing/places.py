"""출구와 DB가 지정한 승강장을 보행 지도에 연결한다."""

import math
import re
from collections import deque

from app.routing.grid import StationGrid
from app.routing.field import distance_field

PLATFORM_DH_M = 0.3


def exit_node(grid: StationGrid, exit_no: str) -> int:
    """POI id 숫자는 실제 출구 번호와 다르므로 exitNo로 찾는다."""
    poi = next(p for p in grid.doc["pois"] if p["kind"] == "exit" and p.get("exitNo") == exit_no)
    return grid.nearest(poi["x"], poi["z"], poi["h"])


def platform_nodes(grid: StationGrid, poi: dict) -> list[int]:
    """승강장 POI에서 같은 높이로 이어진 칸. 계단이 시작되면 높이가 달라져 멈춘다."""
    seed = grid.nearest(poi["x"], poi["z"], poi["h"])
    seen, queue = {seed}, deque([seed])
    while queue:
        for j, _ in grid.neighbors[queue.popleft()]:
            if j not in seen and abs(grid.h_cm[j] / 100 - poi["h"]) <= PLATFORM_DH_M:
                seen.add(j)
                queue.append(j)
    return sorted(seen)


def platform_access(grid: StationGrid, exit_id: int, platform_poi_id: str) -> dict:
    """DB가 지정한 승강장 POI의 보행 영역과 출구 연결 진입점을 찾는다."""
    selected = [p for p in grid.doc["pois"] if p["kind"] == "platform" and p.get("id") == platform_poi_id]
    if len(selected) != 1:
        raise ValueError(f"{grid.doc['id']}: DB의 승강장 POI {platform_poi_id}를 지도에서 하나로 확인할 수 없습니다.")
    poi = selected[0]
    seed = grid.nearest(poi["x"], poi["z"], poi["h"])
    if math.dist(grid.xyz(seed), (poi["x"], poi["z"], poi["h"])) > 1:
        raise ValueError(f"{grid.doc['id']}: 승강장 POI가 보행 영역에서 벗어났습니다.")
    nodes = platform_nodes(grid, poi)
    distances, _ = distance_field(grid.neighbors, exit_id)
    reachable = [i for i in nodes if math.isfinite(distances[i])]
    if not reachable:
        raise ValueError(f"{grid.doc['id']}: 출구와 연결된 승강장 영역이 없습니다.")
    access = min(reachable, key=lambda i: (distances[i], i))
    stairs = [p for p in grid.doc["pois"] if p["kind"] == "stairs"]
    stair = min(stairs, key=lambda p: math.dist(grid.xyz(access), (p["x"], p["z"], p["h"])), default=None)
    if stair is None or math.dist(grid.xyz(access), (stair["x"], stair["z"], stair["h"])) > 3:
        raise ValueError(f"{grid.doc['id']}: 승강장 안내 시작 위치를 계단 POI와 연결할 수 없습니다.")
    return {"poi": poi, "nodes": nodes, "access": access, "target": seed,
            "walk_m": distances[access], "target_walk_m": distances[seed], "access_name": stair["name"]}


def parse_door(value):
    match = re.fullmatch(r"([0-9]+)\s*-\s*([0-9]+)", value.strip()) if isinstance(value, str) else None
    if match is None:
        return None
    car, door = map(int, match.groups())
    return f"{car}-{door}" if car >= 1 and door >= 1 else None

