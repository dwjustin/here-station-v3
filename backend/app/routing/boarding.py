from collections.abc import Mapping

from app.routing.places import parse_door


def fast_exit_doors(rows, line_name, up_down, destination_station_name,
                    destination_next_station=None, destination_station_code=None):
    def text(value):
        return value.strip() if isinstance(value, str) else ""

    # 2. 도착역·호선·방향에 맞는 API 후보만 남긴다.
    eligible_doors = set()

    for row in rows:
        if not isinstance(row, Mapping):
            continue

        if destination_station_code is not None:
            station_matches = (
                text(row.get("stnCd")) == str(destination_station_code).strip()
            )
        else:
            station_matches = (
                text(row.get("stnNm")) == destination_station_name.strip()
            )

        if not station_matches:
            continue
        if text(row.get("lineNm")) != line_name.strip():
            continue
        if text(row.get("upbdnbSe")) != up_down.strip():
            continue

        if destination_next_station is not None:
            if text(row.get("drtnInfo")) != destination_next_station.strip():
                continue

        door = parse_door(row.get("qckgffVhclDoorNo"))
        if door is not None:
            eligible_doors.add(door)

    if not eligible_doors:
        raise ValueError("도착역·호선·방향에 맞는 빠른하차 후보가 없습니다.")

    return sorted(eligible_doors, key=lambda door: tuple(map(int, door.split("-"))))

