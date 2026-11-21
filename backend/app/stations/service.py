import json
import os
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.stations.schemas import Station, StationListResponse, StationPlatform


def _read_rows(table: str, params: dict) -> list:
    base_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not base_url or not secret_key:
        raise HTTPException(status_code=503, detail="역 정보 DB 연결 설정이 없습니다.")

    request = Request(
        f"{base_url}/rest/v1/{table}?{urlencode(params)}",
        headers={"apikey": secret_key, "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=5) as response:
            rows = json.load(response)
        if not isinstance(rows, list):
            raise ValueError("Expected rows")
        return rows
    except (URLError, TimeoutError):
        raise HTTPException(status_code=503, detail="역 정보 DB에 연결할 수 없습니다.") from None
    except ValueError:
        raise HTTPException(status_code=502, detail="역 정보 DB 응답이 올바르지 않습니다.") from None


def search_stations(query: str) -> list[Station]:
    params = {"select": "id,name,lines", "order": "name.asc,id.asc"}
    query = query.strip().removesuffix("역")
    if query:
        # PostgREST 필터 문법과 LIKE 와일드카드로 검색어가 해석되지 않도록 이스케이프한다.
        for character in ("\\", "%", "_", "*"):
            query = query.replace(character, "\\" + character)
        pattern = json.dumps(f"%{query}%", ensure_ascii=False)
        params["or"] = f"(name.ilike.{pattern},id.ilike.{pattern})"
    try:
        return StationListResponse.model_validate({"stations": _read_rows("stations", params)}).stations
    except ValueError:
        raise HTTPException(status_code=502, detail="역 검색 DB 응답이 올바르지 않습니다.") from None


def get_platform_poi_id(station_id: str, line_name: str, up_down: str) -> str:
    filters = {"station_id": station_id, "line_name": line_name, "up_down": up_down}
    params = {"select": "station_id,line_name,up_down,platform_poi_id",
              **{key: f"eq.{value}" for key, value in filters.items()}}
    rows = _read_rows("station_platforms", params)
    if not rows:
        raise HTTPException(status_code=422, detail=f"{station_id}: DB에 {line_name} {up_down} 승강장 연결이 없습니다.")
    try:
        if len(rows) != 1:
            raise ValueError("Ambiguous platform")
        platform = StationPlatform.model_validate(rows[0])
        if any(getattr(platform, key) != value for key, value in filters.items()):
            raise ValueError("Wrong platform")
        return platform.platform_poi_id
    except ValueError:
        raise HTTPException(status_code=502, detail="승강장 연결 DB 응답이 올바르지 않습니다.") from None
