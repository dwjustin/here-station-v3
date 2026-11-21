"""ElevenLabs로 안내 문장을 mp3로 만든다. 키는 서버에만 두고 앱은 이 서버에서 소리를 받는다."""

import json
import os
from functools import lru_cache
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from fastapi import HTTPException

MODEL = "eleven_flash_v2_5"  # 한국어 지원 모델 중 지연이 가장 짧다(문서 기준 약 100ms)
OUTPUT_FORMAT = "mp3_44100_64"
# 문서 예시 목소리. 한국어 목소리를 고르면 ELEVENLABS_VOICE_ID로 바꾼다.
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"


# ponytail: 프로세스 메모리 캐시. 걷는 동안 안내 문장은 몇 가지뿐이라 대부분 여기서 나간다. 서버가 여러 대면 공용 저장소로 옮긴다.
@lru_cache(maxsize=256)
def synthesize(text: str) -> bytes:
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=503, detail="ElevenLabs API 키가 설정되지 않았습니다.")
    voice_id = os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or DEFAULT_VOICE_ID
    request = Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{quote(voice_id, safe='')}?output_format={OUTPUT_FORMAT}",
        data=json.dumps({"text": text, "model_id": MODEL, "language_code": "ko"}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urlopen(request, timeout=10) as response:
            audio = response.read()
    except (URLError, TimeoutError):
        # HTTPError(키 오류·한도 초과)도 URLError다. 앱은 실패하면 기기 TTS로 읽는다.
        raise HTTPException(status_code=502, detail="ElevenLabs 음성 생성에 실패했습니다.") from None
    if not audio:
        raise HTTPException(status_code=502, detail="ElevenLabs가 빈 음성을 돌려주었습니다.")
    return audio
