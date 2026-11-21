"""검증용 합성 좌표. 실제 역의 문 위치를 나타내지 않는다."""
from array import array

from app.routing.grid import StationGrid, pack
from app.routing.transit import Trip
from app.stations.schemas import Station


def make_grid(station_id, cells=(0, 1, 2, 3, 4, 5)):
    return StationGrid({
        "id": station_id, "x0": 0, "z0": 0, "w": 30, "cell": 0.25,
        "levels": [{"name": "B1", "h": 0}],
        "pois": [{"kind": "exit", "exitNo": "1", "x": 0.125, "z": 0.125, "h": 0}],
        "nodes": {"cell": pack(array("i", cells)), "h": pack(array("h", [0] * len(cells)))},
    }, f"revision-{station_id}")


def trip():
    return Trip(Station(id="hongje", name="홍제", lines=["3"]),
                Station(id="jamwon", name="잠원", lines=["3"]),
                "3호선", "하행", "무악재", "고속터미널")


def door_data(grid, nearby_node, next_station):
    return {
        "station_id": grid.doc["id"], "map_revision": grid.revision,
        "line_name": "3호선", "up_down": "하행", "next_station": next_station,
        "verified": True, "source": "synthetic test fixture", "position_reference": "train-car-door",
        "positions": {"1-1": dict(zip(("x", "z", "h"), grid.xyz(5))),
                      "4-2": dict(zip(("x", "z", "h"), grid.xyz(nearby_node)))},
    }


def fast_exit_row(door="4-2"):
    return {"qckgffMngNo": "1497", "stnNm": "잠원", "stnCd": "0328", "lineNm": "3호선",
            "upbdnbSe": "하행", "drtnInfo": "고속터미널", "qckgffVhclDoorNo": door,
            "plfmCmgFac": "계단", "facNo": None, "elvtrNo": None,
            "fwkPstnNm": None, "facPstnNm": None}


def platform_grid(station_id):
    grid = make_grid(station_id)
    grid.h_cm[:] = array("h", [0, 15, 50, 50, 50, 50])
    grid.doc["pois"].extend([
        {"id": "platform1", "name": "공용 승강장", "kind": "platform", "x": 1.125, "z": 0.125, "h": 0.5},
        {"id": "stairs1", "name": "계단 1 아래", "kind": "stairs", "x": 0.375, "z": 0.125, "h": 0.15},
    ])
    grid.neighbors = grid._link()
    return grid
