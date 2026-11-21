"""역 지도 격자: 보행 칸 디코딩과 이웃 그래프. 형식은 지도 파일의 `_doc` 참고."""

import base64
import hashlib
import json
import math
import os
import re
import sys
from array import array
from functools import lru_cache
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

# Docker에서는 infra/compose.yaml이 data/maps를 /app/data/maps에 연결한다.
MAP_DIR = Path(os.environ.get("MAP_DIR") or Path(__file__).resolve().parents[3] / "data" / "maps")
# 계단 한 단(5~30cm)은 잇고, 그보다 큰 차이는 같은 칸에 겹친 다른 층으로 본다.
MAX_STEP_CM = 35
ORTHOGONAL = ((-1, 0), (1, 0), (0, -1), (0, 1))
DIAGONAL = ((-1, -1), (-1, 1), (1, -1), (1, 1))


def unpack(b64: str, typecode: str) -> array:
    values = array(typecode, base64.b64decode(b64))
    if sys.byteorder == "big":
        values.byteswap()
    return values


def pack(values: array) -> str:
    if sys.byteorder == "big":
        values = array(values.typecode, values)
        values.byteswap()
    return base64.b64encode(values.tobytes()).decode("ascii")


class StationGrid:
    """노드 ID = 지도 `nodes` 배열 순서. 칸 번호는 층이 겹치면 반복되므로 ID로 쓰지 않는다."""

    def __init__(self, doc: dict, revision: str):
        self.doc = doc
        self.revision = revision
        self.x0, self.z0, self.w, self.cell = doc["x0"], doc["z0"], doc["w"], doc["cell"]
        self.cells = unpack(doc["nodes"]["cell"], "i")
        self.h_cm = unpack(doc["nodes"]["h"], "h")
        self.neighbors = self._link()

    def _link(self) -> list[list[tuple[int, float]]]:
        self.at: dict[int, list[int]] = {}  # 칸 번호 → 그 칸에 겹친 노드들
        for i, c in enumerate(self.cells):
            self.at.setdefault(c, []).append(i)
        at, w, h_cm = self.at, self.w, self.h_cm

        def step(i: int, c: int, dr: int, dc: int) -> list[int]:
            if not 0 <= c % w + dc < w:
                return []
            return [j for j in at.get(c + dr * w + dc, ()) if abs(h_cm[j] - h_cm[i]) <= MAX_STEP_CM]

        diagonal_cost = self.cell * math.sqrt(2)
        neighbors = []
        for i, c in enumerate(self.cells):
            ortho = {d: step(i, c, *d) for d in ORTHOGONAL}
            links = [(j, self.cell) for js in ortho.values() for j in js]
            for dr, dc in DIAGONAL:
                # 양옆 칸이 두 끝 모두와 이어져야 대각선으로 간다: 벽 모서리를 뚫지 않고, 양방향이 같아야
                # 거꾸로 Dijkstra의 다음 칸이 실제로 걸을 수 있는 걸음이 된다.
                links += [
                    (j, diagonal_cost) for j in step(i, c, dr, dc)
                    if all(any(abs(h_cm[k] - h_cm[j]) <= MAX_STEP_CM for k in ortho[side]) for side in ((dr, 0), (0, dc)))
                ]
            neighbors.append(links)
        return neighbors

    def xyz(self, i: int) -> tuple[float, float, float]:
        c = self.cells[i]
        return (
            self.x0 + (c % self.w + 0.5) * self.cell,
            self.z0 + (c // self.w + 0.5) * self.cell,
            self.h_cm[i] / 100,
        )

    def level(self, i: int) -> str:
        h = self.h_cm[i] / 100
        return min(self.doc["levels"], key=lambda level: abs(level["h"] - h))["name"]

    def nearest(self, x: float, z: float, h: float) -> int:
        return min(range(len(self.cells)), key=lambda i: math.dist(self.xyz(i), (x, z, h)))


def read_map_file(filename: str) -> bytes:
    """같은 저장소의 지도·실측 문 좌표를 읽는다. 파일 이름 외의 경로는 허용하지 않는다."""
    if re.fullmatch(r"[\w-]+(?:\.doors)?\.json", filename) is None:
        raise HTTPException(status_code=422, detail="역 지도 파일 이름이 올바르지 않습니다.")
    if os.environ.get("RENDER") == "true":
        base_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
        secret_key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
        bucket = os.environ.get("STORAGE_BUCKET", "station-maps").strip()
        if not base_url or not secret_key or not bucket:
            raise HTTPException(status_code=503, detail="역 지도 스토리지 연결 설정이 없습니다.")
        request = Request(
            f"{base_url}/storage/v1/object/authenticated/{quote(bucket, safe='')}/{quote(filename, safe='')}",
            headers={"apikey": secret_key, "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=10) as response:
                return response.read()
        except HTTPError as error:
            status = error.code
            error.close()
            if status == 404:
                raise FileNotFoundError(filename) from None
            raise HTTPException(status_code=503, detail="역 지도 파일을 스토리지에서 가져오지 못했습니다.") from None
        except (URLError, TimeoutError) as error:
            raise HTTPException(status_code=503, detail="역 지도 파일을 스토리지에서 가져오지 못했습니다.") from error
    return (MAP_DIR / filename).read_bytes()


# 지도는 역마다 한 번만 내려받고 메모리에 둔다(요청마다 약 4.6초 절약). 지도를 바꾸면 서버를 재시작한다(README 규칙).
# 실패(예외)는 캐시되지 않아 다음 요청에서 다시 받는다. StationGrid는 만든 뒤 바꾸지 않으므로 요청끼리 같이 써도 된다.
@lru_cache(maxsize=32)
def load_map(station_id: str) -> StationGrid:
    raw = read_map_file(f"{station_id}.json")
    try:
        doc = json.loads(raw)
        if doc["id"] != station_id:
            raise ValueError("station_id mismatch")
        return StationGrid(doc, hashlib.sha256(raw).hexdigest())
    except (ValueError, KeyError, TypeError, IndexError, ZeroDivisionError) as error:
        raise HTTPException(status_code=502, detail="역 지도 파일 형식이 올바르지 않습니다.") from error
