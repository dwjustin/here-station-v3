from typing import Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from app.routing.schemas import RouteResponse
from app.routing.service import find_route
from app.stations.schemas import StationListResponse
from app.stations.service import search_stations

app = FastAPI(title="Here Station API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str


class RouteRequest(BaseModel):
    origin_station_id: str = Field(min_length=1, max_length=100, pattern=r"^[\w-]+$")
    destination_station_id: str = Field(min_length=1, max_length=100, pattern=r"^[\w-]+$")


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/stations", response_model=StationListResponse, tags=["stations"])
def get_stations(q: str = Query(default="", max_length=100)) -> StationListResponse:
    return StationListResponse(stations=search_stations(q))


@app.post("/routes", response_model=RouteResponse, tags=["routes"], summary="직통 여정의 승하차 문과 칸별 안내 방향 조회")
def get_route(request: RouteRequest) -> dict[str, Any]:
    try:
        route = find_route(request.origin_station_id, request.destination_station_id)
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="역 지도 파일이 없습니다 (로컬 MAP_DIR 또는 Storage).") from error
    return route
