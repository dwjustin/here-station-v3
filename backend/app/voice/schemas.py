from typing import Any, Literal

from pydantic import BaseModel, Field


class VoiceMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=500, description="user: 음성 인식 결과, assistant: 앞서 서버가 돌려준 reply")


class VoiceTurnRequest(BaseModel):
    messages: list[VoiceMessage] = Field(min_length=1, max_length=12, description="이번 대화 전체. 마지막은 user")


class VoiceTurnResponse(BaseModel):
    reply: str = Field(description="TTS로 그대로 읽을 문장")
    route: dict[str, Any] | None = Field(
        default=None, description="경로를 찾았으면 POST /routes 응답과 같은 형식. 앱은 이것으로 바로 안내를 시작한다"
    )
