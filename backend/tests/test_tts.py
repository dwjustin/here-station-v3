import json
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import HTTPError

from fastapi.testclient import TestClient

from app.main import app
from app.voice.tts import synthesize


class TtsTests(unittest.TestCase):
    def setUp(self):
        synthesize.cache_clear()
        environment = patch.dict("os.environ", {"ELEVENLABS_API_KEY": "test-key", "ELEVENLABS_VOICE_ID": "voice/1"})
        environment.start()
        self.addCleanup(environment.stop)
        self.client = TestClient(app)

    def test_text_becomes_mp3_and_is_cached(self):
        with patch("app.voice.tts.urlopen", side_effect=[BytesIO(b"ID3mp3")]) as fetch:
            for _ in range(2):
                response = self.client.get("/voice/tts", params={"text": " 왼쪽으로 도세요. "})
                self.assertEqual((response.status_code, response.content), (200, b"ID3mp3"))
                self.assertEqual(response.headers["content-type"], "audio/mpeg")
        fetch.assert_called_once()  # 두 번째는 캐시
        request = fetch.call_args.args[0]
        self.assertEqual(request.full_url,
                         "https://api.elevenlabs.io/v1/text-to-speech/voice%2F1?output_format=mp3_44100_64")
        self.assertEqual(request.get_header("Xi-api-key"), "test-key")
        self.assertEqual(json.loads(request.data),
                         {"text": "왼쪽으로 도세요.", "model_id": "eleven_flash_v2_5", "language_code": "ko"})

    def test_errors(self):
        with patch.dict("os.environ", {"ELEVENLABS_API_KEY": ""}):
            self.assertEqual(self.client.get("/voice/tts", params={"text": "a"}).status_code, 503)
        for answer in [HTTPError("u", 401, "bad key", {}, None), TimeoutError(), BytesIO(b"")]:
            with self.subTest(answer=answer), patch("app.voice.tts.urlopen", side_effect=[answer]):
                self.assertEqual(self.client.get("/voice/tts", params={"text": f"b{answer!r}"}).status_code, 502)
        for text in ["", "가" * 501]:
            self.assertEqual(self.client.get("/voice/tts", params={"text": text}).status_code, 422)
