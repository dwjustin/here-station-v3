from typing import Any

from fastapi import FastAPI, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app.routing.schemas import RouteResponse
from app.routing.service import find_route
from app.stations.schemas import StationListResponse
from app.stations.service import search_stations
from app.voice.schemas import VoiceTurnRequest, VoiceTurnResponse
from app.voice.service import voice_turn
from app.voice.tts import synthesize

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


@app.post("/voice/turn", response_model=VoiceTurnResponse, tags=["voice"],
          summary="사용자 말(음성 인식 결과)로 역을 알아듣고 경로를 찾아 말로 설명")
def post_voice_turn(request: VoiceTurnRequest) -> VoiceTurnResponse:
    return voice_turn(request)


@app.get("/voice/tts", tags=["voice"], summary="안내 문장을 ElevenLabs 음성(mp3)으로", response_class=Response,
         responses={200: {"content": {"audio/mpeg": {}}}})
def get_tts(text: str = Query(min_length=1, max_length=500)) -> Response:
    return Response(content=synthesize(text.strip()), media_type="audio/mpeg",
                    headers={"Cache-Control": "public, max-age=86400"})
