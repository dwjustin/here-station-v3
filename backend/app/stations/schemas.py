from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field


class Station(BaseModel):
    id: str = Field(min_length=1, max_length=100, description="경로 요청에 사용하는 역 ID")
    name: str = Field(min_length=1, max_length=100, description="표시할 역 이름")
    lines: list[Annotated[str, Field(min_length=1, max_length=20)]] = Field(
        min_length=1, description="호선 ID 목록. 예: ['3']"
    )


class StationListResponse(BaseModel):
    stations: list[Station]


class StationMap(BaseModel):
    id: UUID
    station_id: str = Field(min_length=1, max_length=100)
    version: str = Field(min_length=1, max_length=100)
    storage_bucket: str = Field(min_length=1, max_length=100)
    map_path: str = Field(min_length=1, description="버킷 안의 보행 지도 JSON 경로")
    glb_path: str | None = Field(default=None, min_length=1, description="표시용 GLB 경로")
