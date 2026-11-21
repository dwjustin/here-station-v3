import math
import unittest
from array import array

from app.routing.field import NO_DIRECTION, directions, distance_field
from app.routing.grid import MAX_STEP_CM, StationGrid, pack

W = 40


def make_grid(cells: list[tuple[int, int, int]]) -> StationGrid:
    """(행, 열, 높이 cm) 목록으로 합성 지도를 만든다."""
    doc = {
        "id": "test", "x0": 0, "z0": 0, "w": W, "cell": 0.25,
        "levels": [{"name": "1F", "h": 3.0}, {"name": "B1", "h": 0.0}],
        "nodes": {
            "cell": pack(array("i", [r * W + c for r, c, _ in cells])),
            "h": pack(array("h", [h for _, _, h in cells])),
        },
    }
    return StationGrid(doc, "test")


def node_at(grid: StationGrid, row: int, col: int, h_cm: int) -> int:
    return next(i for i in range(len(grid.cells)) if grid.cells[i] == row * W + col and grid.h_cm[i] == h_cm)


class FieldTests(unittest.TestCase):
    def assert_field_reaches_goal(self, grid: StationGrid, goal: int) -> list[float]:
        """닿는 칸마다 다음 칸을 따라가면 목적지에 닿고, 각 걸음은 걸을 수 있는 칸만 지난다."""
        dist, next_hop = distance_field(grid.neighbors, goal)
        walkable = {(grid.cells[i], grid.h_cm[i]) for i in range(len(grid.cells))}

        def walkable_near(cell: int, h_cm: int) -> bool:
            return any(c == cell and abs(h - h_cm) <= MAX_STEP_CM for c, h in walkable)

        for start in range(len(grid.cells)):
            if math.isinf(dist[start]):
                self.assertEqual(next_hop[start], -1)
                continue
            i, steps = start, 0
            while i != goal:
                j = next_hop[i]
                a, b = grid.cells[i], grid.cells[j]
                dr, dc = b // W - a // W, b % W - a % W
                self.assertLessEqual(max(abs(dr), abs(dc)), 1)
                self.assertLessEqual(abs(grid.h_cm[j] - grid.h_cm[i]), MAX_STEP_CM)
                if dr and dc:
                    self.assertTrue(walkable_near(a + dc, grid.h_cm[i]) and walkable_near(a + dr * W, grid.h_cm[i]))
                i, steps = j, steps + 1
                self.assertLess(steps, len(grid.cells))
        return dist

    def test_l_corridor(self):
        # 가로 통로(행 0~1) 끝에서 아래로 꺾는 세로 통로(열 28~29). 앞보기 3m보다 길게.
        cells = {(r, c, 0) for r in range(2) for c in range(30)} | {(r, c, 0) for r in range(30) for c in range(28, 30)}
        grid = make_grid(sorted(cells))
        goal = node_at(grid, 29, 29, 0)
        dist = self.assert_field_reaches_goal(grid, goal)
        self.assertTrue(all(math.isfinite(d) for d in dist))
        _, next_hop = distance_field(grid.neighbors, goal)
        direction = directions(grid, next_hop, goal)
        self.assertEqual(direction[goal], NO_DIRECTION)
        self.assertAlmostEqual(direction[node_at(grid, 0, 0, 0)] / 10, 90, delta=10)  # 통로 따라 동쪽
        self.assertAlmostEqual(direction[node_at(grid, 10, 28, 0)] / 10, 180, delta=10)  # 꺾은 뒤 남쪽

    def test_stacked_floors_join_only_by_ramp(self):
        # 아래층(0cm) 위에 위층(300cm)이 같은 칸으로 겹치고, 25cm씩 오르는 경사로로만 이어진다.
        lower = {(r, c, 0) for r in range(2) for c in range(5)}
        ramp = {(r, c, (c - 4) * 25) for r in range(2) for c in range(5, 17)}
        upper = {(r, c, 300) for r in range(2) for c in range(5)} | {(r, c, 300) for r in range(2, 4) for c in range(17)}
        grid = make_grid(sorted(lower | ramp | upper))
        goal = node_at(grid, 0, 0, 0)
        dist = self.assert_field_reaches_goal(grid, goal)
        above = node_at(grid, 0, 0, 300)
        _, next_hop = distance_field(grid.neighbors, goal)
        self.assertNotEqual(grid.h_cm[next_hop[above]], 0)
        self.assertGreater(dist[above], 2 * 12 * 0.25)  # 바로 아래가 목적지여도 경사로를 돌아간다

    def test_no_diagonal_through_wall_corner(self):
        # (0,0) → (1,1) 대각선은 (0,1)이 벽이라 막히고 (1,0)을 거친다.
        grid = make_grid([(0, 0, 0), (1, 0, 0), (1, 1, 0)])
        goal = node_at(grid, 1, 1, 0)
        dist = self.assert_field_reaches_goal(grid, goal)
        self.assertAlmostEqual(dist[node_at(grid, 0, 0, 0)], 0.5)

    def test_unreachable_has_no_direction(self):
        grid = make_grid([(0, 0, 0), (0, 1, 0), (5, 5, 0)])
        goal = node_at(grid, 0, 0, 0)
        _, next_hop = distance_field(grid.neighbors, goal)
        direction = directions(grid, next_hop, goal)
        self.assertEqual(direction[node_at(grid, 5, 5, 0)], NO_DIRECTION)
        self.assertEqual(direction[node_at(grid, 0, 1, 0)], 2700)  # 서쪽


