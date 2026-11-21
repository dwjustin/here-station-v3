from collections.abc import Mapping

from app.routing.places import door_nodes, parse_door


def fast_exit_doors(rows, line_name, up_down, destination_station_name,
                    destination_next_station=None, destination_station_code=None):
    def text(value):
        return value.strip() if isinstance(value, str) else ""

    # 2. 도착역·호선·방향에 맞는 API 후보만 남긴다.
    eligible_doors = set()

    for row in rows:
        if not isinstance(row, Mapping):
            continue

        if destination_station_code is not None:
            station_matches = (
                text(row.get("stnCd")) == str(destination_station_code).strip()
            )
        else:
            station_matches = (
                text(row.get("stnNm")) == destination_station_name.strip()
            )

        if not station_matches:
            continue
        if text(row.get("lineNm")) != line_name.strip():
            continue
        if text(row.get("upbdnbSe")) != up_down.strip():
            continue

        if destination_next_station is not None:
            if text(row.get("drtnInfo")) != destination_next_station.strip():
                continue

        door = parse_door(row.get("qckgffVhclDoorNo"))
        if door is not None:
            eligible_doors.add(door)

    if not eligible_doors:
        raise ValueError("도착역·호선·방향에 맞는 빠른하차 후보가 없습니다.")

    return sorted(eligible_doors, key=lambda door: tuple(map(int, door.split("-"))))


def choose_boarding_points(
    *,
    rows,
    origin_grid,
    destination_grid,
    origin_exit,
    destination_exit,
    line_name,
    up_down,
    destination_station_name,
    origin_doors,
    destination_doors,
    destination_station_code=None,
    destination_next_station=None,
):
    """
    빠른하차 후보 중 양쪽 역의 보행거리 합이 가장 짧은 문을 선택한다.

    rows:
        API 응답에서 꺼낸 행 목록.
        stnNm, stnCd, lineNm, upbdnbSe, drtnInfo,
        qckgffVhclDoorNo 필드를 사용한다.

    origin_doors / destination_doors:
        각 역에서 확인한 문 좌표를 아래 형태로 전달한다.
        같은 문 번호는 같은 열차 위치에 대응해야 한다.

        {
            "station_id": "...",
            "map_revision": "...",  # 좌표를 기록했을 때의 지도 버전
            "line_name": "3호선",
            "up_down": "상행",
            "verified": True,
            "source": "공식 도면 또는 실측 기록의 출처",
            "position_reference": "train-car-door",
            "positions": {
                "4-2": {"x": 실제좌표, "z": 실제좌표, "h": 실제높이},
                ...
            },
        }

    반환:
        {
            "door_no": "4-2",
            "boarding_node": 출발역_승차_노드,
            "alighting_node": 도착역_하차_노드,
            "origin_walk_m": 출발역_보행거리,
            "destination_walk_m": 도착역_보행거리,
            "total_walk_m": 두_거리의_합,
        }
    """
    import math

    from app.routing.field import distance_field

    # 1. 출구 노드와 선택 조건 확인
    for grid, node in [
        (origin_grid, origin_exit),
        (destination_grid, destination_exit),
    ]:
        if type(node) is not int or not 0 <= node < len(grid.cells):
            raise ValueError("출구 노드가 지도 범위를 벗어났습니다.")

    if not all(isinstance(v, str) and v.strip() for v in [
        line_name,
        up_down,
        destination_station_name,
    ]):
        raise ValueError("호선·방향·도착역 이름이 필요합니다.")

    eligible_doors = set(fast_exit_doors(
        rows, line_name, up_down, destination_station_name,
        destination_next_station, destination_station_code,
    ))

    # 3. 양쪽 지도에서 문 번호에 해당하는 보행 노드를 찾는다.
    origin_nodes = door_nodes(origin_grid, origin_doors, line_name, up_down)
    destination_nodes = door_nodes(destination_grid, destination_doors, line_name, up_down)

    shared_doors = (
        eligible_doors
        & origin_nodes.keys()
        & destination_nodes.keys()
    )
    if not shared_doors:
        raise ValueError("후보 문의 좌표를 두 역 지도에서 찾지 못했습니다.")

    # 4. 보행 그래프로 양쪽 출구까지의 거리를 계산한다.
    # 현재 StationGrid의 연결은 양방향이다.
    origin_distances, _ = distance_field(
        origin_grid.neighbors,
        origin_exit,
    )
    destination_distances, _ = distance_field(
        destination_grid.neighbors,
        destination_exit,
    )

    choices = []

    for door in shared_doors:
        boarding_node = origin_nodes[door]
        alighting_node = destination_nodes[door]

        origin_walk = origin_distances[boarding_node]
        destination_walk = destination_distances[alighting_node]

        if not (
            math.isfinite(origin_walk)
            and math.isfinite(destination_walk)
        ):
            continue

        choices.append({
            "door_no": door,
            "boarding_node": boarding_node,
            "alighting_node": alighting_node,
            "origin_walk_m": origin_walk,
            "destination_walk_m": destination_walk,
            "total_walk_m": origin_walk + destination_walk,
        })

    if not choices:
        raise ValueError("양쪽 출구에서 걸어서 닿을 수 있는 승하차 문이 없습니다.")

    # 5. 합계가 같으면 도착역 보행거리, 칸·문 번호 순서로 고른다.
    return min(
        choices,
        key=lambda choice: (
            choice["total_walk_m"],
            choice["destination_walk_m"],
            *map(int, choice["door_no"].split("-")),
        ),
    )
