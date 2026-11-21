from array import array
from typing import Any

from fastapi import HTTPException

from app.routing.boarding import fast_exit_doors
from app.routing.field import NO_DIRECTION, directions, distance_field
from app.routing.grid import StationGrid, load_map, pack
from app.routing.places import exit_node, platform_access
from app.routing.public_data import get_fast_exit_rows
from app.routing.transit import resolve_trip
from app.stations.service import get_platform_poi_id


def find_route(
    origin_station_id: str,
    destination_station_id: str,
) -> dict[str, Any]:
    trip = resolve_trip(origin_station_id, destination_station_id)
    origin = load_map(origin_station_id)
    destination = load_map(destination_station_id)
    try:
        origin_exit = exit_node(origin, "1")
        destination_exit = exit_node(destination, "1")
    except (StopIteration, ValueError):
        raise HTTPException(status_code=422, detail="지도에서 1번 출구의 보행 위치를 찾을 수 없습니다.") from None
    rows = get_fast_exit_rows(trip.destination.name, trip.line_name)
    try:
        doors = fast_exit_doors(rows, trip.line_name, trip.up_down, trip.destination.name, trip.destination_next_station)
        origin_platform = platform_access(origin, origin_exit, get_platform_poi_id(trip.origin.id, trip.line_name, trip.up_down))
        destination_platform = platform_access(destination, destination_exit, get_platform_poi_id(trip.destination.id, trip.line_name, trip.up_down))
        legs = [
            # 경계 바로 앞에서 멈추지 않도록 POI를 향하게 하고, 앱은 영역 진입 시 안내를 끝낸다.
            build_leg(origin, origin_exit, origin_platform["target"], arrival_radius=2.0),
            build_leg(destination, destination_platform["access"], destination_exit, arrival_radius=1.5),
        ]
        for leg, platform in zip(legs, (origin_platform, destination_platform)):
            leg["platform"] = {
                "id": platform["poi"]["id"], "name": platform["poi"]["name"],
                "nodes": pack(array("i", platform["nodes"])), "access_name": platform["access_name"],
            }
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    return {
        "trip": {
            "origin_station_id": trip.origin.id, "origin_station_name": trip.origin.name,
            "destination_station_id": trip.destination.id, "destination_station_name": trip.destination.name,
            "line_name": trip.line_name, "up_down": trip.up_down, "direction": trip.direction,
            "destination_next_station": trip.destination_next_station,
            # shortcut: 문 좌표 없이 API 후보를 번호순 추천, 출구별 문 매핑이 생기면 최적화한다.
            "door_no": doors[0],
            "origin_walk_m": origin_platform["target_walk_m"], "destination_walk_m": destination_platform["walk_m"],
        },
        "legs": legs,
    }


def build_leg(grid: StationGrid, start: int, goal: int, arrival_radius: float) -> dict[str, Any]:
    _, next_hop = distance_field(grid.neighbors, goal)
    direction = directions(grid, next_hop, goal)
    if direction[start] == NO_DIRECTION:
        raise RuntimeError(f"{grid.doc['id']}: 출발 칸에서 목적지 칸으로 이어지지 않는다")

    def point(i: int) -> dict[str, Any]:
        x, z, h = grid.xyz(i)
        return {"level": grid.level(i), "x": x, "z": z, "h": h}

    return {
        "station_id": grid.doc["id"],
        "map_revision": grid.revision,
        "grid": {"x0": grid.x0, "z0": grid.z0, "w": grid.w, "cell": grid.cell},
        "start": {**point(start), "heading_deg": direction[start] / 10},
        "goal": {**point(goal), "arrival_radius": arrival_radius},
        "cells": pack(grid.cells),
        "h": pack(grid.h_cm),
        "direction": pack(direction),
    }
