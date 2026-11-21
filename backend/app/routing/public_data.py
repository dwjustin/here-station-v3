# backend/app/routing/public_data.py

import json
import os
from typing import Any
from urllib.error import URLError
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen

from fastapi import HTTPException


FAST_EXIT_URL = "https://apis.data.go.kr/B553766/inout/getFstExit"


def fetch_fast_exit_page(
    station_name: str,
    line_name: str,
    page: int = 1,
) -> dict[str, Any]:
    key = os.environ.get("DATA_GO_KR_SERVICE_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="빠른하차 API 인증키가 설정되지 않았습니다.")
    params = {
        "serviceKey": unquote(key),
        "dataType": "JSON",
        "pageNo": page,
        "numOfRows": 100,
        "lineNm": line_name,
        "stnNm": station_name,
    }

    request = Request(
        f"{FAST_EXIT_URL}?{urlencode(params)}",
        headers={"Accept": "application/json"},
    )

    try:
        with urlopen(request, timeout=10) as response:
            payload = json.load(response)
    except (URLError, TimeoutError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="빠른하차정보를 가져오지 못했습니다.",
        ) from None

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=502,
            detail="빠른하차정보 응답 형식을 확인해야 합니다.",
        )

    return payload


def get_fast_exit_rows(station_name: str, line_name: str) -> list[dict[str, Any]]:
    """response.body.items.item의 모든 페이지를 읽고 연결 설비 필드도 보존한다."""
    rows = []
    page = 1
    total = None
    while True:
        payload = fetch_fast_exit_page(station_name, line_name, page)
        try:
            response = payload["response"]
            if response["header"]["resultCode"] != "00":
                raise ValueError("API result code")
            body = response["body"]
            count, size = body["totalCount"], body["numOfRows"]
            if (type(count) is not int or count < 0 or type(size) is not int or size <= 0
                    or body["pageNo"] != page or (total is not None and total != count)):
                raise ValueError("pagination")
            total = count
            items = body["items"]
            items = items["item"] if isinstance(items, dict) else items
            if not items and total == 0:
                items = []
            if isinstance(items, dict):
                items = [items]
            if not isinstance(items, list) or len(items) != min(size, total - len(rows)):
                raise ValueError("incomplete page")
            for item in items:
                if not isinstance(item, dict) or not all(
                    isinstance(item.get(key), str) and item[key].strip()
                    for key in ("stnNm", "stnCd", "lineNm", "upbdnbSe", "drtnInfo", "qckgffVhclDoorNo", "plfmCmgFac")
                ):
                    raise ValueError("row fields")
            rows.extend(items)
            if len(rows) == total:
                break
            page += 1
        except (KeyError, TypeError, ValueError):
            raise HTTPException(status_code=502, detail="빠른하차정보 응답 또는 페이지 형식이 올바르지 않습니다.") from None
    if not rows:
        raise HTTPException(status_code=422, detail="도착역의 빠른하차 후보가 없습니다.")
    return rows
