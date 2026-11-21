"""말로 출발·도착역을 받아 경로를 찾고, 결과를 귀로만 들어도 되게 말로 설명한다.

앱이 기기 음성 인식(STT)으로 만든 글자를 보내면 Claude가 역을 알아듣고 find_route 도구로 경로를 계산한다.
Claude가 쓴 답(reply)은 앱이 그대로 TTS로 읽는다. 걷는 동안의 안내는 앱이 규칙으로 말한다(LLM 안 씀).
"""

import json
import os
from typing import Any

import anthropic
from fastapi import HTTPException

from app.routing.service import find_route
from app.stations.service import search_stations
from app.voice.schemas import VoiceTurnRequest, VoiceTurnResponse

MODEL = "claude-haiku-5-5"  # 음성 대화라 지연이 중요하다. 실측: Opus 5.5 6.2초 → Haiku 5.5 5.0초
MAX_TOOL_ROUNDS = 2
FALLBACK_REPLY = "죄송해요, 지금은 말로 길 찾기를 할 수 없어요. 화면에서 역을 골라 주세요."

SYSTEM = """너는 지하철역 실내 길안내 앱의 음성 안내원이다. 사용자는 화면을 보지 않고 에어팟으로 네 말만 듣는다.
사용자 말은 음성 인식 결과라 역 이름이 틀리게 적힐 수 있다(예: "홍재" → 홍제, "잠원력" → 잠원역). 아래 역 목록에서 가장 가까운 역으로 알아듣는다.

할 일:
1. 사용자 말에서 출발역과 도착역을 알아듣는다. 둘 다 확실하면 바로 find_route 도구를 부른다.
2. 하나라도 빠지거나 목록에 없는 역이면 도구를 부르지 말고 한 가지만 짧게 묻는다.
3. 도구 결과로 경로를 설명한다. 순서: 출발역 1번 출구에서 시작, 몇 호선 무슨 방면을 타는지, 어느 역에서 내리는지, 내릴 문 번호, 도착역 1번 출구로 나간다는 것.
   마지막에 "걷는 동안 방향은 제가 말로 알려 드릴게요. 휴대폰은 카메라가 앞을 보게 가슴 앞에 들어 주세요."를 붙인다.
4. 도구가 오류를 돌려주면 그 이유를 쉬운 말로 한 문장으로 전하고 다른 역을 말해 달라고 한다.

말투와 형식:
- 소리 내 읽을 문장만 쓴다. 마크다운, 목록 기호, 이모지, 괄호, 영어 약어를 쓰지 않는다.
- 존댓말로 짧은 문장 2~4개. 도구 결과에 없는 사실(시간, 요금, 환승)을 지어내지 않는다.
- 문 번호 "4-2"는 "4번 칸 2번 문"처럼 읽기 쉽게 말한다."""

FIND_ROUTE_TOOL = {
    "name": "find_route",
    "description": "두 역 사이 길안내 경로를 계산한다. 반드시 역 목록의 id를 넣는다.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "origin_station_id": {"type": "string", "description": "출발역 id"},
            "destination_station_id": {"type": "string", "description": "도착역 id"},
        },
        "required": ["origin_station_id", "destination_station_id"],
        "additionalProperties": False,
    },
}


def station_list() -> str:
    stations = search_stations("")
    return "\n".join(f"- {s.name}역 (id: {s.id}, 호선: {', '.join(s.lines)})" for s in stations)


def run_find_route(tool_input: dict[str, Any]) -> tuple[dict[str, Any] | None, str, bool]:
    """(앱에 줄 전체 경로, Claude에 줄 결과 문자열, 오류 여부). Claude에는 base64 격자를 빼고 trip만 준다."""
    try:
        route = find_route(tool_input["origin_station_id"], tool_input["destination_station_id"])
    except HTTPException as error:
        return None, f"경로를 찾지 못함: {error.detail}", True
    except FileNotFoundError:
        return None, "경로를 찾지 못함: 이 역의 지도 파일이 아직 없습니다.", True
    return route, json.dumps(route["trip"], ensure_ascii=False, default=str), False


def reply_text(message: Any) -> str:
    return " ".join(block.text for block in message.content if block.type == "text").strip()


def voice_turn(request: VoiceTurnRequest) -> VoiceTurnResponse:
    if request.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="마지막 메시지는 사용자 말이어야 합니다.")
    messages: list[dict[str, Any]] = [{"role": m.role, "content": m.text} for m in request.messages]
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="음성 안내용 Claude API 키가 설정되지 않았습니다.")
    system = f"{SYSTEM}\n\n역 목록:\n{station_list()}"
    client = anthropic.Anthropic()

    route: dict[str, Any] | None = None
    for _ in range(MAX_TOOL_ROUNDS + 1):
        try:
            # 음성 응답은 기다림이 짧아야 해서 effort는 low로 둔다.
            # Haiku 5.5는 서버 측 fallbacks가 없어 거절(refusal)은 아래에서 고정 문장으로 처리한다.
            response = client.messages.create(
                model=MODEL,
                max_tokens=2000,
                system=system,
                messages=messages,
                tools=[FIND_ROUTE_TOOL],
                output_config={"effort": "low"},
            )
        except anthropic.AuthenticationError:
            raise HTTPException(status_code=503, detail="음성 안내용 Claude API 키가 올바르지 않습니다.") from None
        except anthropic.APIConnectionError:
            raise HTTPException(status_code=503, detail="음성 안내 서버(Claude)에 연결할 수 없습니다.") from None
        except anthropic.APIStatusError as error:
            raise HTTPException(status_code=502, detail=f"음성 안내 서버(Claude) 오류 {error.status_code}") from None

        if response.stop_reason == "refusal":
            return VoiceTurnResponse(reply=FALLBACK_REPLY, route=None)
        tool_uses = [block for block in response.content if block.type == "tool_use"]
        if response.stop_reason != "tool_use" or not tool_uses:
            return VoiceTurnResponse(reply=reply_text(response) or FALLBACK_REPLY, route=route)

        # thinking 블록까지 그대로 돌려줘야 다음 요청에서 이어진다.
        messages.append({"role": "assistant", "content": response.content})
        results = []
        for block in tool_uses:
            found, content, is_error = run_find_route(block.input)
            route = found or route
            results.append({"type": "tool_result", "tool_use_id": block.id, "content": content, "is_error": is_error})
        messages.append({"role": "user", "content": results})

    return VoiceTurnResponse(reply=FALLBACK_REPLY, route=route)
