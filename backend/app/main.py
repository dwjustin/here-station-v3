from typing import Any

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from app.routing.service import find_route
from app.stations.schemas import StationListResponse
from app.stations.service import search_stations

app = FastAPI(title="Here Station API", version="0.1.0")


class HealthResponse(BaseModel):
    status: str


class RouteRequest(BaseModel):
    origin_station_id: str = Field(min_length=1, max_length=100)
    destination_station_id: str = Field(min_length=1, max_length=100)


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/stations", response_model=StationListResponse, tags=["stations"])
def get_stations(q: str = Query(default="", max_length=100)) -> StationListResponse:
    return StationListResponse(stations=search_stations(q))


@app.post("/routes", tags=["routes"], summary="예시 경로 조회 (일원 → 학여울)")
def get_route(request: RouteRequest) -> dict[str, Any]:
    route = find_route(request.origin_station_id, request.destination_station_id)
    if route is None:
        raise HTTPException(status_code=404, detail="현재 mock 경로는 ilwon → hakyeoul만 지원합니다.")
    return route
