"""새 역 지도 JSON을 쓰기 전에 자동 점검한다 (표준 라이브러리만, 서버 경로 계산 코드를 그대로 쓴다).

실행: backend/.venv/bin/python tools/map-check/check_map.py data/maps/<역>.json [--walk]
항목마다 PASS/WARN/FAIL과 개수, 가장 나쁜 곳 좌표 (x, z, h m)를 찍는다. FAIL이 하나라도 있으면 종료 코드 1.
"""

import argparse
import hashlib
import heapq
import json
import math
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.routing.field import NO_DIRECTION, directions, distance_field  # noqa: E402
from app.routing.grid import MAX_STEP_CM, StationGrid, unpack  # noqa: E402
from app.routing.places import OGEUM_BOUND, door_1_1, exit_node  # noqa: E402

REQUIRED = ("id", "cell", "x0", "z0", "w", "h", "levels", "pois", "nodes", "georef")
MAIN_SHARE = 0.95  # 가장 큰 연결 덩어리가 이보다 작으면 지도가 끊긴 것
POI_SNAP_M = 1.0  # POI에서 가장 가까운 칸이 이보다 멀면 좌표가 어긋난 것
REFUSED_DH_CM = (MAX_STEP_CM, 100)  # 서버가 잇지 않는 턱 중 사람이 넘을 수도 있는 높이
DETOUR_M = 5.0  # 턱 아래·위가 길로 이보다 멀면 막힌 곳 (맨 윗단이 낮게 스캔된 막다른 계단 줄 등)
STRIP_TAIL_M = 0.5  # 다른 높이와 닿은 곳에서 이보다 길게 뻗은 좁은 띠 (계단 옆 난간 윗면 등)
LAYER_GAP_CM = 100  # 같은 칸에 겹친 보행면이 MAX_STEP_CM~이 사이로 떨어지면 사람이 설 수 없는 층 (계단 단면이 여러 겹 등)
NO_DIR_SHARE = 0.02  # 목적지와 이어지지 않는 칸 비율 경고선
WALL_AHEAD_M = 0.5
WALL_SHARE = 0.01
GOAL_SKIP_M = 2.0  # 목적지 주변은 화살표가 모여 반대 방향이 정상
WORST = 5


def fmt(points) -> str:
    return ", ".join(f"({x:.2f}, {z:.2f}, {h:.2f})" for x, z, h in points[:WORST])


def within(neighbors, start: int, radius: float) -> set[int]:
    """start에서 보행 거리 radius 안의 노드."""
    dist, heap = {start: 0.0}, [(0.0, start)]
    while heap:
        d, i = heapq.heappop(heap)
        if d > dist[i]:
            continue
        for j, cost in neighbors[i]:
            if d + cost <= radius and d + cost < dist.get(j, math.inf):
                dist[j] = d + cost
                heapq.heappush(heap, (d + cost, j))
    return set(dist)


def connected(neighbors, nodes: set[int]) -> bool:
    """nodes가 서로의 링크만으로 한 덩어리인지."""
    start = next(iter(nodes))
    seen, stack = {start}, [start]
    while stack:
        for j, _ in neighbors[stack.pop()]:
            if j in nodes and j not in seen:
                seen.add(j)
                stack.append(j)
    return len(seen) == len(nodes)


class Report:
    def __init__(self):
        self.rows: list[tuple[str, str, str]] = []

    def add(self, level: str, name: str, text: str) -> None:
        self.rows.append((level, name, text))
        print(f"[{level}] {name}: {text}", flush=True)

    @property
    def failed(self) -> bool:
        return any(level == "FAIL" for level, _, _ in self.rows)


def check_schema(doc: dict, r: Report) -> bool:
    missing = [k for k in REQUIRED if k not in doc] + [f"nodes.{k}" for k in ("cell", "h") if k not in doc.get("nodes", {})]
    if missing:
        r.add("FAIL", "1 형식", f"필드 없음 {missing}")
        return False
    cells, hs = unpack(doc["nodes"]["cell"], "i"), unpack(doc["nodes"]["h"], "h")
    bad = sum(not 0 <= c < doc["w"] * doc["h"] for c in cells)
    pois = doc["pois"]
    exits = [p for p in pois if p["kind"] == "exit"]
    kinds = {k: sum(p["kind"] == k for p in pois) for k in ("exit", "platform", "stairs")}
    problems = []
    if len(cells) != len(hs) or not cells:
        problems.append(f"칸 {len(cells)}개 / 높이 {len(hs)}개")
    if bad:
        problems.append(f"격자 밖 칸 {bad}개")
    if not doc["levels"]:
        problems.append("층 없음")
    if not kinds["exit"] or not kinds["platform"]:
        problems.append("출구 또는 승강장 POI 없음")
    text = (f"격자 {doc['w']}x{doc['h']} ({doc['cell']}m), 칸 {len(cells)}개, 층 {[lv['name'] for lv in doc['levels']]}, "
            f"출구 {kinds['exit']} (번호 {sorted(p.get('exitNo', '?') for p in exits)}), 승강장 {kinds['platform']}, 계단 {kinds['stairs']}")
    if problems:
        r.add("FAIL", "1 형식", f"{'; '.join(problems)} | {text}")
        return False
    no_number = [p["id"] for p in exits if not p.get("exitNo")]
    r.add("WARN" if no_number or not kinds["stairs"] else "PASS", "1 형식",
          text + (f" | exitNo 없는 출구 {no_number}" if no_number else "") + ("" if kinds["stairs"] else " | 계단 POI 없음"))
    return True


def components(neighbors) -> list[int]:
    """노드마다 연결 덩어리 번호 (0 = 가장 큰 덩어리)."""
    comp, sizes = [-1] * len(neighbors), []
    for seed in range(len(neighbors)):
        if comp[seed] >= 0:
            continue
        comp[seed], stack, n = len(sizes), [seed], 0
        while stack:
            n += 1
            for j, _ in neighbors[stack.pop()]:
                if comp[j] < 0:
                    comp[j] = comp[seed]
                    stack.append(j)
        sizes.append(n)
    order = sorted(range(len(sizes)), key=lambda k: -sizes[k])
    rank = {k: n for n, k in enumerate(order)}
    return [rank[c] for c in comp]


def check_connectivity(grid: StationGrid, r: Report) -> list[int]:
    comp = components(grid.neighbors)
    n = len(comp)
    main = comp.count(0)
    off = [i for i in range(n) if comp[i]]
    level = "PASS" if main / n >= MAIN_SHARE else "WARN"
    r.add(level, "2 연결", f"가장 큰 덩어리 {100 * main / n:.2f}% ({main}/{n}), 덩어리 {max(comp) + 1}개, "
          f"못 닿는 칸 {len(off)}개" + (f" 예 {fmt([grid.xyz(i) for i in off[::max(1, len(off) // WORST)]])}" if off else ""))
    bad, far = [], []
    for p in grid.doc["pois"]:
        if p["kind"] not in ("exit", "platform", "stairs"):
            continue
        i = grid.nearest(p["x"], p["z"], p["h"])
        d = math.dist(grid.xyz(i), (p["x"], p["z"], p["h"]))
        if comp[i]:
            bad.append(f"{p['id']}{fmt([grid.xyz(i)])}")
        elif d > POI_SNAP_M:
            far.append(f"{p['id']} {d:.1f}m")
    if bad:
        r.add("FAIL", "2 POI", f"큰 덩어리 밖 POI {len(bad)}개: {', '.join(bad)}")
    else:
        r.add("WARN" if far else "PASS", "2 POI", "출구·승강장·계단 POI 모두 큰 덩어리에 닿음"
              + (f" | 가장 가까운 칸이 {POI_SNAP_M}m 넘게 먼 POI: {', '.join(far)}" if far else ""))
    return comp


def refused_steps(grid: StationGrid) -> list[tuple[int, int]]:
    """2칸 안, 높이 차 REFUSED_DH_CM인 (아래, 위) 쌍 중 그래프로 DETOUR_M 넘게 돌아가야 하는 것."""
    w, h_cm, near = grid.w, grid.h_cm, {}
    lo, hi = REFUSED_DH_CM
    out = []
    for i, c in enumerate(grid.cells):
        for dr in range(-2, 3):
            for dc in range(-2, 3):
                if not (dr or dc) or not 0 <= c % w + dc < w:
                    continue
                for j in grid.at.get(c + dr * w + dc, ()):
                    dh = h_cm[j] - h_cm[i]
                    if not lo < dh <= hi:
                        continue
                    if i not in near:
                        near[i] = within(grid.neighbors, i, DETOUR_M)
                    if j not in near[i]:
                        out.append((i, j))
    return out


def areas(grid: StationGrid, pairs) -> list[tuple[tuple[float, float, float], int, int]]:
    """쌍을 3m 칸으로 묶어 (대표 좌표, 쌍 수, 최대 dh) 목록, 쌍 많은 순."""
    groups: dict[tuple[int, int], list] = {}
    for i, j in pairs:
        x, z, _ = grid.xyz(i)
        groups.setdefault((round(x / 3), round(z / 3)), []).append((grid.h_cm[j] - grid.h_cm[i], i))
    out = [(grid.xyz(max(v)[1]), len(v), max(v)[0]) for v in groups.values()]
    return sorted(out, key=lambda a: -a[1])


def check_refused(grid: StationGrid, r: Report) -> None:
    pairs = refused_steps(grid)
    remain = areas(grid, pairs)
    text = f"서버가 잇지 않는 {REFUSED_DH_CM[0]}~{REFUSED_DH_CM[1]}cm 턱 {len(remain)}군데 ({len(pairs)}쌍)"
    if remain:
        text += " 많은 순: " + ", ".join(f"{fmt([p])} {n}쌍 최대 {dh}cm" for p, n, dh in remain[:WORST])
    # 사람이 넘는 턱(낮게 스캔된 계단 맨 윗단)인지 난간·벽인지는 지도만으로 모른다: 눈으로 볼 목록이라 WARN.
    r.add("WARN" if remain else "PASS", "3 막힌 턱", text)


def check_layers(grid: StationGrid, r: Report) -> None:
    # MAX_STEP_CM 안의 겹침은 같은 바닥의 스캔 중복이라 서버가 이웃을 함께 잇고 앱도 가까운 높이를 고른다
    close = []  # (같은 칸 노드 수, 가장 좁은 간격 cm, 아래 노드)
    for nodes in grid.at.values():
        hs = sorted(nodes, key=lambda i: grid.h_cm[i])
        gaps = [(grid.h_cm[b] - grid.h_cm[a], a) for a, b in zip(hs, hs[1:]) if MAX_STEP_CM < grid.h_cm[b] - grid.h_cm[a] < LAYER_GAP_CM]
        if gaps:
            close.append((len(nodes), *min(gaps)))
    close.sort(key=lambda t: (-t[0], t[1]))
    r.add("WARN" if close else "PASS", "3b 가까운 겹층",
          f"{MAX_STEP_CM}~{LAYER_GAP_CM}cm로 보행면이 겹친 칸 {len(close)}개"
          + (" 겹 많은 순: " + ", ".join(f"{fmt([grid.xyz(i)])} {n}겹 {g}cm" for n, g, i in close[:WORST]) if close else ""))


def narrow_dead_ends(grid: StationGrid) -> list[list[int]]:
    """같은 높이로 이어진 띠 중 3x3 칸이 꽉 찬 곳이 없고(좁고) 한쪽만 다른 높이와 닿아 STRIP_TAIL_M 넘게 뻗은 것 → 끝부터 정렬."""
    w, h_cm, neighbors = grid.w, grid.h_cm, grid.neighbors
    seen, out = set(), []
    for seed in range(len(grid.cells)):
        if seed in seen:
            continue
        group, stack = {seed}, [seed]
        while stack:
            for j, _ in neighbors[stack.pop()]:
                if j not in group and h_cm[j] == h_cm[seed]:
                    group.add(j)
                    stack.append(j)
        seen |= group
        cells = {grid.cells[i] for i in group}
        if any(all(0 <= c % w + dc < w and c + dr * w + dc in cells for dr in (-1, 0, 1) for dc in (-1, 0, 1)) for c in cells):
            continue
        touching = {i for i in group if any(j not in group for j, _ in neighbors[i])}
        if not touching or len(touching) == len(group) or not connected(neighbors, touching):
            continue
        contact = [grid.xyz(i) for i in touching]
        reach = {i: min(math.dist(grid.xyz(i), p) for p in contact) for i in group}
        if max(reach.values()) >= STRIP_TAIL_M:
            out.append(sorted(group, key=lambda i: -reach[i]))
    return sorted(out, key=len, reverse=True)


def check_strips(grid: StationGrid, r: Report) -> None:
    strips = narrow_dead_ends(grid)
    # 난간 윗면처럼 걸을 수 없는 띠면 지도에서 빼야 앱 위치 추정이 그 위로 올라가지 않는다.
    r.add("WARN" if strips else "PASS", "4 막다른 띠",
          f"좁은 막다른 띠 {len(strips)}개 ({sum(map(len, strips))}칸)"
          + (f" 큰 순 끝: {fmt([grid.xyz(s[0]) for s in strips])}" if strips else ""))


def routes(grid: StationGrid) -> list[tuple[str, int, list[tuple[str, int]]]]:
    """(이름, 목적지, [(출발 이름, 출발 칸)]). 오금 방면 설정이 있으면 출구 → 1-1, 없으면 출구 → 승강장마다."""
    exits = [(f"출구 {p['exitNo']}", exit_node(grid, p["exitNo"])) for p in grid.doc["pois"]
             if p["kind"] == "exit" and p.get("exitNo")]
    if grid.doc["id"] in OGEUM_BOUND:
        return [("오금 방면 1-1", door_1_1(grid), exits)]
    return [(p["id"], grid.nearest(p["x"], p["z"], p["h"]), exits)
            for p in grid.doc["pois"] if p["kind"] == "platform"]


def ahead_blocked(grid: StationGrid, i: int, deg: float) -> bool:
    """i에서 화살표 방향으로 WALL_AHEAD_M 안에 높이 차 MAX_STEP_CM 넘는 칸(벽)이 있으면 True."""
    x, z, _ = grid.xyz(i)
    a, h = math.radians(deg), grid.h_cm[i]
    for s in range(1, round(WALL_AHEAD_M / (grid.cell / 2)) + 1):
        d = s * grid.cell / 2
        col = math.floor((x + math.sin(a) * d - grid.x0) / grid.cell)
        row = math.floor((z - math.cos(a) * d - grid.z0) / grid.cell)
        nodes = grid.at.get(row * grid.w + col, ()) if 0 <= col < grid.w else ()
        dh, j = min(((abs(grid.h_cm[j] - h), j) for j in nodes), default=(math.inf, -1))
        if dh > MAX_STEP_CM:
            return True
        h = grid.h_cm[j]
    return False


def check_fields(grid: StationGrid, r: Report) -> None:
    for name, goal, starts in routes(grid):
        _, next_hop = distance_field(grid.neighbors, goal)
        direction = directions(grid, next_hop, goal)
        gx, gz, _ = grid.xyz(goal)
        title = f"5 화살표 → {name}"
        dead = [s for s, i in starts if direction[i] == NO_DIRECTION]
        if dead:
            r.add("FAIL", title, f"목적지로 이어지지 않는 출발: {dead}")
        none = sum(d == NO_DIRECTION for d in direction) - 1  # 목적지 칸 제외
        far = [i for i in range(len(direction)) if direction[i] != NO_DIRECTION
               and math.hypot(grid.xyz(i)[0] - gx, grid.xyz(i)[1] - gz) > GOAL_SKIP_M]
        # 서로를 가리키는 이웃 쌍: 다음 칸을 따라가면 둘 사이를 오가는 골짜기 (능선처럼 서로 등진 쌍은 정상).
        facing = []
        for i in far:
            xi, zi, _ = grid.xyz(i)
            for j, _ in grid.neighbors[i]:
                if j <= i or direction[j] == NO_DIRECTION or grid.h_cm[j] != grid.h_cm[i]:
                    continue
                xj, zj, _ = grid.xyz(j)
                ai, aj = math.radians(direction[i] / 10), math.radians(direction[j] / 10)
                to_j = math.sin(ai) * (xj - xi) - math.cos(ai) * (zj - zi)
                to_i = math.sin(aj) * (xi - xj) - math.cos(aj) * (zi - zj)
                if to_j > 0 and to_i > 0 and math.cos(ai - aj) < -0.5:
                    facing.append(i)
        walls = [i for i in far if ahead_blocked(grid, i, direction[i] / 10)]
        n = len(direction)
        text = (f"방향 없는 칸 {100 * none / n:.2f}% ({none}), 서로 마주 보는 이웃 {len(facing)}쌍"
                + (f" {fmt([grid.xyz(i) for i in facing])}" if facing else "")
                + f", {WALL_AHEAD_M}m 앞 벽 {100 * len(walls) / n:.2f}% ({len(walls)})"
                + (f" 예 {fmt([grid.xyz(i) for i in walls[::max(1, len(walls) // WORST)]])}" if walls else ""))
        warn = none / n > NO_DIR_SHARE or facing or len(walls) / n > WALL_SHARE
        r.add("WARN" if warn else "PASS", title, f"출발 {[s for s, _ in starts]} | " + text)


def check_walk(r: Report) -> None:
    try:
        proc = subprocess.run(["npm", "test"], cwd=ROOT / "apps" / "mobile", capture_output=True, text=True)
    except OSError as e:
        r.add("FAIL", "6 가상 보행", f"npm test 실행 못 함: {e}")
        return
    out = proc.stdout + proc.stderr
    lines = [ln.strip() for ln in out.splitlines() if re.search(r"\d+/\d+ 도착", ln)]
    # shortcut: 가상 보행은 data/route-hongje-jamwon.json 고정 데이터(홍제·잠원)만 걷는다, 다른 역은 경로 API가 생기면 연결.
    if proc.returncode != 0:
        r.add("FAIL", "6 가상 보행", " | ".join(lines) or out[-500:])
    elif not lines:
        # 고정 데이터가 없으면 실제 경로 보행이 건너뛰어져도 테스트는 통과한다
        r.add("WARN", "6 가상 보행", "도착률 줄 없음: data/route-hongje-jamwon.json이 없어 실제 경로 보행을 건너뛴 듯")
    else:
        r.add("PASS", "6 가상 보행", " | ".join(lines))


def check(doc: dict, revision: str = "check", walk: bool = False) -> Report:
    r = Report()
    if check_schema(doc, r):
        grid = StationGrid(doc, revision)
        comp = check_connectivity(grid, r)
        check_refused(grid, r)
        check_layers(grid, r)
        check_strips(grid, r)
        if not any(comp[grid.nearest(p["x"], p["z"], p["h"])] for p in doc["pois"] if p["kind"] in ("exit", "platform")):
            check_fields(grid, r)
    if walk:
        check_walk(r)
    return r


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("map", type=Path)
    ap.add_argument("--walk", action="store_true", help="모바일 가상 보행 회귀(npm test)도 돌린다")
    args = ap.parse_args()
    raw = args.map.read_bytes()
    r = check(json.loads(raw), hashlib.sha256(raw).hexdigest(), args.walk)
    print(f"결과: FAIL {sum(x[0] == 'FAIL' for x in r.rows)}, WARN {sum(x[0] == 'WARN' for x in r.rows)}")
    sys.exit(1 if r.failed else 0)


if __name__ == "__main__":
    main()
