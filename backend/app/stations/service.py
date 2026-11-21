import json
import os
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException

from app.stations.schemas import Station, StationListResponse


def search_stations(query: str) -> list[Station]:
    base_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    if not base_url or not secret_key:
        raise HTTPException(status_code=503, detail="역 검색 DB 연결 설정이 없습니다.")

    params = {"select": "id,name,lines", "order": "name.asc,id.asc"}
    query = query.strip().removesuffix("역")
    if query:
        # PostgREST 필터 문법과 LIKE 와일드카드로 검색어가 해석되지 않도록 이스케이프한다.
        for character in ("\\", "%", "_", "*"):
            query = query.replace(character, "\\" + character)
        pattern = json.dumps(f"%{query}%", ensure_ascii=False)
        params["or"] = f"(name.ilike.{pattern},id.ilike.{pattern})"
    request = Request(
        f"{base_url}/rest/v1/stations?{urlencode(params)}",
        headers={"apikey": secret_key, "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=5) as response:
            return StationListResponse.model_validate({"stations": json.load(response)}).stations
    except (URLError, TimeoutError) as error:
        raise HTTPException(status_code=503, detail="역 검색 DB에 연결할 수 없습니다.") from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail="역 검색 DB 응답이 올바르지 않습니다.") from error
