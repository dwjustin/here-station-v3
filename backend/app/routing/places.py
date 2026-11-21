"""출구 노드와 검증된 승하차 문 좌표를 지도에 연결한다."""

import json
import math
import re
from collections.abc import Mapping
from collections import deque

from fastapi import HTTPException

from app.routing.grid import StationGrid, read_map_file
from app.routing.field import distance_field

# 3호선 우측통행, 오금 방면. travel: 진행 방향이 선로 축(georef.railDeg)의 +/-,
# track_side: 오금 방면 선로가 진행 방향의 오른쪽(1)/왼쪽(-1).
OGEUM_BOUND = {
    "hongje": {"platform": "platform1", "travel": 1, "track_side": 1},  # 진행 남동, 섬식으로 봄
    "jamwon": {"platform": "platform1", "travel": -1, "track_side": -1},  # 진행 남서, 북서쪽 상대식
}
PLATFORM_DH_M = 0.3
# shortcut: 맨 앞 칸 첫 문을 승강장 끝에서 1.5m 안으로 추정, 공공데이터 승차위치 API 연결 시 교체.
DOOR_DEPTH_M = 1.5


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


def door_1_1(grid: StationGrid) -> int:
    """과거 추정점의 지도 점검용 함수. 실제 /routes에서는 사용하지 않는다."""
    spec = OGEUM_BOUND[grid.doc["id"]]
    poi = next(p for p in grid.doc["pois"] if p["id"] == spec["platform"])
    rail = math.radians(grid.doc["georef"]["railDeg"])
    tx, tz = spec["travel"] * math.cos(rail), -spec["travel"] * math.sin(rail)
    # (x, z)에서 진행 방향의 오른쪽은 (-tz, tx).
    sx, sz = -tz * spec["track_side"], tx * spec["track_side"]
    along = {i: grid.xyz(i)[0] * tx + grid.xyz(i)[1] * tz for i in platform_nodes(grid, poi)}
    front = max(along.values())
    near_front = [i for i, a in along.items() if front - a <= DOOR_DEPTH_M]
    return max(near_front, key=lambda i: grid.xyz(i)[0] * sx + grid.xyz(i)[1] * sz)


def parse_door(value):
    match = re.fullmatch(r"([0-9]+)\s*-\s*([0-9]+)", value.strip()) if isinstance(value, str) else None
    if match is None:
        return None
    car, door = map(int, match.groups())
    return f"{car}-{door}" if car >= 1 and door >= 1 else None


def door_nodes(grid, door_data, line_name, up_down):
    if not isinstance(door_data, Mapping):
        raise ValueError("검증된 문 좌표 자료가 필요합니다.")
    if door_data.get("verified") is not True or not isinstance(door_data.get("source"), str) or not door_data["source"].strip():
        raise ValueError("문 좌표의 실측·공식 근거와 verified=true 확인이 필요합니다.")
    if door_data.get("position_reference") != "train-car-door":
        raise ValueError("양쪽 역에서 같은 열차 칸·문 번호 기준을 사용해야 합니다.")
    # 다른 지도나 반대 방향의 문 좌표가 섞이는 것을 방지한다.
    expected = {
        "station_id": grid.doc["id"],
        "map_revision": grid.revision,
        "line_name": line_name,
        "up_down": up_down,
    }
    for key, value in expected.items():
        if door_data.get(key) != value:
            raise ValueError(
                f"{grid.doc['id']}: 문 좌표의 {key}가 요청과 다릅니다."
            )

    positions = door_data.get("positions")
    if not isinstance(positions, Mapping):
        raise ValueError("문 좌표 positions가 필요합니다.")

    nodes = {}
    seen = set()

    for raw_door, position in positions.items():
        door = parse_door(raw_door)
        if door is None or door in seen:
            raise ValueError(f"잘못되거나 중복된 문 번호: {raw_door}")
        seen.add(door)

        if not isinstance(position, Mapping):
            raise ValueError(f"{door}: 문 좌표 형식이 잘못됐습니다.")

        coordinates = [
            position.get("x"),
            position.get("z"),
            position.get("h"),
        ]
        if not all(
            isinstance(v, (int, float))
            and not isinstance(v, bool)
            and math.isfinite(v)
            for v in coordinates
        ):
            raise ValueError(f"{door}: x, z, h는 유한한 숫자여야 합니다.")

        x, z, h = coordinates
        col = math.floor((x - grid.x0) / grid.cell)
        row = math.floor((z - grid.z0) / grid.cell)

        if row < 0 or not 0 <= col < grid.w:
            continue

        # 해당 좌표가 속한 칸만 확인한다.
        # 벽이나 빈 공간이면 가까운 다른 칸으로 옮겨 붙이지 않는다.
        cell = row * grid.w + col
        candidates = [
            node
            for node in grid.at.get(cell, ())
            if abs(grid.h_cm[node] / 100 - h) <= 0.15 + 1e-9
        ]

        if candidates:
            nodes[door] = min(
                candidates,
                key=lambda node: (
                    abs(grid.h_cm[node] / 100 - h),
                    node,
                ),
            )

    return nodes


def load_door_positions(grid: StationGrid, line_name: str, up_down: str, next_station: str | None) -> dict:
    """지도와 별개인 {station_id}.doors.json에서 검증된 방면별 실측 좌표를 읽는다."""
    try:
        raw = read_map_file(f"{grid.doc['id']}.doors.json")
    except FileNotFoundError:
        raise HTTPException(status_code=422, detail=f"{grid.doc['id']}: 실제 승하차 문 좌표 파일이 없어 지원하지 않습니다.") from None
    try:
        doc = json.loads(raw)
        profiles = doc["profiles"]
        if not isinstance(profiles, list) or not all(isinstance(p, dict) for p in profiles):
            raise ValueError("profiles")
        selected = [p for p in profiles if p.get("line_name") == line_name
                    and p.get("up_down") == up_down and p.get("next_station") == next_station]
        if len(selected) != 1:
            raise HTTPException(status_code=422, detail=f"{grid.doc['id']}: 해당 호선·방면의 문 좌표를 하나로 확인할 수 없습니다.")
        return {**selected[0], "station_id": doc["station_id"], "map_revision": doc["map_revision"]}
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=502, detail="승하차 문 좌표 파일 형식이 올바르지 않습니다.") from None
