from pydantic import BaseModel, Field


class GridSpec(BaseModel):
    x0: float = Field(description="격자 왼쪽 위 모서리 x(m, 동쪽)")
    z0: float = Field(description="격자 왼쪽 위 모서리 z(m, 남쪽)")
    w: int = Field(gt=0, description="격자 가로 칸 수. 칸 번호 = 행 x w + 열")
    cell: float = Field(gt=0, description="칸 한 변 길이(m)")


class LegPoint(BaseModel):
    level: str = Field(description="바닥 높이가 가장 가까운 층 이름")
    x: float
    z: float
    h: float = Field(description="바닥 높이(m)")


class LegStart(LegPoint):
    heading_deg: float = Field(ge=0, lt=360, description="출발 칸의 화살표 방위. 사용자는 이 방향을 보고 선다")


class LegGoal(LegPoint):
    arrival_radius: float = Field(gt=0, description="도착 판정 반경(m)")


class PlatformArea(BaseModel):
    id: str
    name: str
    nodes: str = Field(description="승강장 보행 영역 노드 ID의 Int32 LE base64, cells 배열 인덱스")
    access_name: str = Field(description="출구 연결 진입점에 가장 가까운 지도 계단 POI 이름")


class RouteLeg(BaseModel):
    station_id: str
    map_revision: str = Field(description="지도 파일 바이트의 SHA-256")
    grid: GridSpec
    start: LegStart
    goal: LegGoal
    platform: PlatformArea | None = None
    cells: str = Field(description="Int32 LE 칸 번호 base64, 지도 nodes.cell 순서")
    h: str = Field(description="Int16 LE 바닥 높이(cm) base64, 같은 순서")
    direction: str = Field(
        description="Uint16 LE 방위(0.1° 단위 0..3599, 지도 북 0° 시계 방향) base64, 같은 순서. 65535 = 방향 없음"
    )


class TripInfo(BaseModel):
    origin_station_id: str
    origin_station_name: str
    destination_station_id: str
    destination_station_name: str
    line_name: str
    up_down: str
    direction: str = Field(description="출발역에서 향하는 다음 역. 열차의 종착역을 보장하지 않는다")
    destination_next_station: str | None
    door_no: str = Field(pattern=r"^[1-9][0-9]*-[1-9][0-9]*$")
    origin_walk_m: float = Field(ge=0)
    destination_walk_m: float = Field(ge=0)


class RouteResponse(BaseModel):
    trip: TripInfo
    legs: list[RouteLeg]
