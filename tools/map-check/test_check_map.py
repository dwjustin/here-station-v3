"""실행: backend/.venv/bin/python -m unittest discover tools/map-check"""

import contextlib
import io
import subprocess
import unittest
from array import array
from unittest import mock

from check_map import Report, check, check_walk
from app.routing.grid import pack  # check_map이 backend를 sys.path에 넣는다

W = 40


def make_doc(cells: list[tuple[int, int, int]], pois: list[dict]) -> dict:
    """(행, 열, 높이 cm) 칸과 POI로 합성 지도를 만든다."""
    return {
        "id": "test", "cell": 0.25, "x0": 0, "z0": 0, "w": W, "h": W, "georef": {},
        "levels": [{"name": "B1", "h": 0.0}], "pois": pois,
        "nodes": {"cell": pack(array("i", [r * W + c for r, c, _ in cells])),
                  "h": pack(array("h", [h for _, _, h in cells]))},
    }


def poi(kind: str, row: int, col: int, **extra) -> dict:
    return {"id": f"{kind}{row}", "kind": kind, "x": (col + 0.5) * 0.25, "z": (row + 0.5) * 0.25, "h": 0.0, **extra}


# 4칸 폭 통로(열 0~29) 양 끝에 출구와 승강장, 행 4에서 20cm 높은 1칸 폭 막다른 곁가지.
CORRIDOR = [(r, c, 0) for r in range(4) for c in range(30)] + [(r, 10, 20) for r in range(4, 9)]
POIS = [poi("exit", 1, 0, exitNo="1"), poi("platform", 1, 29), poi("stairs", 1, 15)]


def run(doc: dict):
    with contextlib.redirect_stdout(io.StringIO()):
        return {name: level for level, name, _ in check(doc).rows}


class CheckMapTests(unittest.TestCase):
    def test_clean_corridor_passes(self):
        levels = run(make_doc(CORRIDOR, POIS))
        self.assertNotIn("FAIL", levels.values())
        self.assertEqual(levels["2 POI"], "PASS")
        self.assertEqual(levels["5 화살표 → platform1"], "PASS")
        self.assertEqual(levels["4 막다른 띠"], "WARN")
        self.assertEqual(levels["3b 가까운 겹층"], "PASS")

    def test_close_stacked_layer_warns(self):
        # 통로 위 50cm에 겹친 판: 사람이 설 수 없는 층이라 WARN.
        levels = run(make_doc(CORRIDOR + [(1, c, 50) for c in range(20, 23)], POIS))
        self.assertEqual(levels["3b 가까운 겹층"], "WARN")
        # 10cm 겹침은 같은 바닥의 스캔 중복이라 세지 않는다.
        levels = run(make_doc(CORRIDOR + [(1, c, 10) for c in range(20, 23)], POIS))
        self.assertEqual(levels["3b 가까운 겹층"], "PASS")

    def test_exit_on_island_fails(self):
        # 통로와 떨어진 섬(행 20~21)에 출구가 있으면 경로를 만들 수 없다.
        island = [(r, c, 0) for r in range(20, 22) for c in range(2)]
        levels = run(make_doc(CORRIDOR + island, POIS + [poi("exit", 20, 0, exitNo="2")]))
        self.assertEqual(levels["2 POI"], "FAIL")

    def test_missing_nodes_fails(self):
        doc = make_doc(CORRIDOR, POIS)
        del doc["nodes"]["h"]
        levels = run(doc)
        self.assertEqual(levels, {"1 형식": "FAIL"})

    def test_walk_without_arrival_line_or_npm(self):
        # 고정 데이터가 없어 실제 경로 보행을 건너뛰면 통과(0)여도 WARN, npm이 없으면 FAIL.
        cases = [(subprocess.CompletedProcess([], 0, "ok\n", ""), "WARN"), (FileNotFoundError("npm"), "FAIL")]
        for result, level in cases:
            r = Report()
            with mock.patch("check_map.subprocess.run", side_effect=[result]):
                check_walk(r)
            self.assertEqual(r.rows[0][0], level)


if __name__ == "__main__":
    unittest.main()
