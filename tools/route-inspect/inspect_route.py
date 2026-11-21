"""홍제 → 잠원 경로 응답을 data/에 저장하고 구간별 디버그 PNG를 그린다 (표준 라이브러리만).

실행: backend/.venv/bin/python tools/route-inspect/inspect_route.py
"""

import json
import math
import struct
import sys
import time
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.routing.field import NO_DIRECTION, distance_field  # noqa: E402
from app.routing.grid import load_map, unpack  # noqa: E402
from app.routing.service import find_route  # noqa: E402

OUT = ROOT / "data"
SCALE = 2  # 칸 하나 = 2px
# 3x5 숫자 글꼴: 행마다 3비트.
DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
          "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"]


def write_png(path: Path, w: int, h: int, px: bytearray) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    rows = b"".join(b"\0" + bytes(px[y * w * 3:(y + 1) * w * 3]) for y in range(h))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))


def draw_leg(leg: dict, path: Path) -> None:
    grid = load_map(leg["station_id"])
    direction = unpack(leg["direction"], "H")
    gw, gh = grid.w, grid.doc["h"]
    w, h = gw * SCALE, gh * SCALE
    px = bytearray(b"\xff" * (w * h * 3))
    hs = [grid.h_cm[i] for i in range(len(grid.cells))]
    lo, hi = min(hs), max(hs)

    def to_px(x: float, z: float) -> tuple[int, int]:
        return int((x - grid.x0) / grid.cell * SCALE), int((z - grid.z0) / grid.cell * SCALE)

    def dot(x: int, y: int, color: tuple, r: int = 0) -> None:
        for yy in range(y - r, y + r + 1):
            for xx in range(x - r, x + r + 1):
                if 0 <= xx < w and 0 <= yy < h:
                    px[(yy * w + xx) * 3:(yy * w + xx) * 3 + 3] = bytes(color)

    def line(x0: float, y0: float, x1: float, y1: float, color: tuple) -> None:
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for t in range(n + 1):
            dot(round(x0 + (x1 - x0) * t / n), round(y0 + (y1 - y0) * t / n), color)

    def label(x: int, y: int, text: str, color: tuple) -> None:
        for k, ch in enumerate(text):
            for b, bit in enumerate(DIGITS[int(ch)]):
                if bit == "1":
                    dot(x + (k * 4 + b % 3) * 2, y + b // 3 * 2, color, 1)

    # 높은 층부터 칠해 승강장(가장 깊은 층)이 위에 보이게 한다. 밝을수록 높음.
    visible: dict[int, int] = {}
    for i in sorted(range(len(grid.cells)), key=lambda i: -grid.h_cm[i]):
        c = grid.cells[i]
        shade = 150 + int(90 * (grid.h_cm[i] - lo) / max(1, hi - lo))
        for dy in range(SCALE):
            for dx in range(SCALE):
                dot(c % gw * SCALE + dx, c // gw * SCALE + dy, (shade, shade, shade))
        visible[c] = i
    # 출발 → 도착 경로(파랑).
    start = grid.nearest(leg["start"]["x"], leg["start"]["z"], leg["start"]["h"])
    goal = grid.nearest(leg["goal"]["x"], leg["goal"]["z"], leg["goal"]["h"])
    _, next_hop = distance_field(grid.neighbors, goal)
    i = start
    while next_hop[i] >= 0:
        dot(*to_px(*grid.xyz(i)[:2]), (60, 110, 230), 1)
        i = next_hop[i]
    # 화살표: 약 2m(8칸)마다, 그 칸에 보이는 층의 방향. 꼬리 검정, 머리 빨강.
    step = round(2 / grid.cell)
    for c, i in visible.items():
        if (c // gw) % step or (c % gw) % step or direction[i] == NO_DIRECTION:
            continue
        x, y = to_px(*grid.xyz(i)[:2])
        a = math.radians(direction[i] / 10)
        tx, ty = x + math.sin(a) * 12, y - math.cos(a) * 12
        line(x, y, tx, ty, (40, 40, 40))
        dot(round(tx), round(ty), (220, 40, 40), 1)
    for p in grid.doc["pois"]:
        x, y = to_px(p["x"], p["z"])
        if p["kind"] == "exit":
            dot(x, y, (240, 140, 0), 4)
            label(x + 8, y - 4, p["exitNo"], (240, 140, 0))
        elif p["kind"] == "platform":
            dot(x, y, (0, 160, 200), 4)
    dot(*to_px(leg["start"]["x"], leg["start"]["z"]), (0, 180, 0), 6)
    dot(*to_px(leg["goal"]["x"], leg["goal"]["z"]), (220, 0, 0), 6)
    write_png(path, w, h, px)


def main() -> None:
    started = time.perf_counter()
    route = find_route("hongje", "jamwon")
    print(f"경로 계산 {time.perf_counter() - started:.1f}s")
    body = json.dumps(route, ensure_ascii=False)
    (OUT / "route-hongje-jamwon.json").write_text(body, encoding="utf-8")
    print(f"응답 {len(body.encode()) / 1e6:.2f}MB")
    for leg in route["legs"]:
        reachable = sum(d != NO_DIRECTION for d in unpack(leg["direction"], "H")) + 1  # 목적지 칸 포함
        total = len(unpack(leg["h"], "h"))
        print(f"{leg['station_id']}: 칸 {total}, 닿는 칸 {100 * reachable / total:.2f}%, "
              f"start {leg['start']}, goal {leg['goal']}")
        draw_leg(leg, OUT / f"route-{leg['station_id']}.png")


if __name__ == "__main__":
    main()
