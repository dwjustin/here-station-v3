"""공식 순서가 확인된 직선 노선만 처리한다. 순환·지선·환승은 별도 구현 전까지 미지원."""

from dataclasses import dataclass

from fastapi import HTTPException

from app.stations.schemas import Station
from app.stations.service import search_stations

# 서울시 공식 수도권 노선도(2025-08). 역 ID와 역번호의 크기로 방향을 추정하지 않는다.
# https://japanese.seoul.go.kr/wp-content/uploads/2025/08/cliamte-card-service-availability.pdf
LINE_3 = (
    "대화", "주엽", "정발산", "마두", "백석", "대곡", "화정", "원당", "원흥", "삼송",
    "지축", "구파발", "연신내", "불광", "녹번", "홍제", "무악재", "독립문", "경복궁", "안국",
    "종로3가", "을지로3가", "충무로", "동대입구", "약수", "금호", "옥수", "압구정", "신사", "잠원",
    "고속터미널", "교대", "남부터미널", "양재", "매봉", "도곡", "대치", "학여울", "대청", "일원",
    "수서", "가락시장", "경찰병원", "오금",
)


@dataclass(frozen=True)
class Trip:
    origin: Station
    destination: Station
    line_name: str
    up_down: str
    direction: str
    destination_next_station: str | None


def resolve_trip(origin_station_id: str, destination_station_id: str) -> Trip:
    if origin_station_id == destination_station_id:
        raise HTTPException(status_code=422, detail="출발역과 도착역은 달라야 합니다.")

    def station(station_id: str) -> Station:
        matches = [row for row in search_stations(station_id) if row.id == station_id]
        if len(matches) != 1:
            raise HTTPException(status_code=404, detail=f"등록된 역을 찾을 수 없습니다: {station_id}")
        return matches[0]

    origin, destination = station(origin_station_id), station(destination_station_id)
    shared_lines = set(origin.lines) & set(destination.lines)
    if not shared_lines:
        raise HTTPException(status_code=422, detail="환승이 필요한 여정은 아직 지원하지 않습니다.")
    if "3" not in shared_lines:
        raise HTTPException(status_code=422, detail="현재 공식 노선 순서가 등록된 직통 3호선만 지원합니다.")
    if origin.name not in LINE_3 or destination.name not in LINE_3:
        raise HTTPException(status_code=422, detail="역 이름을 공식 3호선 노선 순서에 연결할 수 없습니다.")
    start, end = LINE_3.index(origin.name), LINE_3.index(destination.name)
    if start == end:
        raise HTTPException(status_code=422, detail="같은 역의 중복 등록을 확인해야 합니다.")
    step = 1 if start < end else -1
    # 실제 getFstExit 응답: 하행=홍제→무악재·잠원→고속터미널, 상행=반대 방향.
    return Trip(origin, destination, "3호선", "하행" if step == 1 else "상행",
                LINE_3[start + step], LINE_3[end + step] if 0 <= end + step < len(LINE_3) else None)
