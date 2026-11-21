"""목적지 칸에서 거꾸로 Dijkstra → 칸마다 화살표 방위."""

import heapq
import math
from array import array

from app.routing.grid import MAX_STEP_CM, StationGrid

# 인접 칸(45° 단위) 대신 경로를 이만큼 따라간 점을 가리켜 화살표를 부드럽게 한다.
# 그 점까지 직선이 벽·난간을 지나면 보이는 가장 먼 경로 점을 가리킨다 (가상 보행에서 안쪽 모퉁이·꺾인 계단에서 벽을 가리켜 막혔다).
LOOKAHEAD_M = 3.0
NO_DIRECTION = 65535


def bearing(ax: float, az: float, bx: float, bz: float) -> float:
    """지도 북 0°, 시계 방향. z는 남쪽이라 북쪽 성분은 -dz."""
    return math.degrees(math.atan2(bx - ax, -(bz - az))) % 360


def distance_field(neighbors: list[list[tuple[int, float]]], goal: int) -> tuple[list[float], list[int]]:
    """목적지까지 보행 거리 D와 목적지 쪽 다음 칸. 닿지 않는 칸은 inf, -1."""
    dist = [math.inf] * len(neighbors)
    next_hop = [-1] * len(neighbors)
    dist[goal] = 0.0
    heap = [(0.0, goal)]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, cost in neighbors[i]:
            if d + cost < dist[j]:
                dist[j] = d + cost
                next_hop[j] = i
                heapq.heappush(heap, (dist[j], j))
    return dist, next_hop


def in_sight(grid: StationGrid, a: int, b: int) -> bool:
    """a → b 직선을 칸 절반 간격으로 따라가며 매번 높이 차 MAX_STEP_CM 안의 보행 칸을 밟으면 True."""
    ax, az, _ = grid.xyz(a)
    bx, bz, _ = grid.xyz(b)
    n = math.ceil(math.hypot(bx - ax, bz - az) / (grid.cell / 2))
    h = grid.h_cm[a]
    for s in range(1, n + 1):
        col = math.floor((ax + (bx - ax) * s / n - grid.x0) / grid.cell)
        row = math.floor((az + (bz - az) * s / n - grid.z0) / grid.cell)
        nodes = grid.at.get(row * grid.w + col, []) if 0 <= col < grid.w else []
        dh, j = min(((abs(grid.h_cm[j] - h), j) for j in nodes), default=(math.inf, -1))
        if dh > MAX_STEP_CM:
            return False
        h = grid.h_cm[j]
    return True


def directions(grid: StationGrid, next_hop: list[int], goal: int) -> array:
    """칸마다 방위(0.1° 단위, 0..3599). 목적지와 닿지 않는 칸은 NO_DIRECTION."""
    points = [grid.xyz(i) for i in range(len(next_hop))]
    out = array("H", [NO_DIRECTION]) * len(next_hop)
    for i, (x, z, _) in enumerate(points):
        if i == goal or next_hop[i] < 0:
            continue
        path, travelled = [next_hop[i]], 0.0
        while path[-1] != goal and travelled < LOOKAHEAD_M:
            j, k = path[-1], next_hop[path[-1]]
            travelled += math.hypot(points[k][0] - points[j][0], points[k][1] - points[j][1])
            path.append(k)
        # 다음 칸은 이웃이라 항상 보인다. 먼 점부터 보이는지 확인
        j = next(j for j in reversed(path) if j == path[0] or in_sight(grid, i, j))
        out[i] = round(bearing(x, z, points[j][0], points[j][1]) * 10) % 3600
    return out
