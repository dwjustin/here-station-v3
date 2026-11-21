import json
import unittest
from types import SimpleNamespace as NS
from unittest.mock import MagicMock, patch

import anthropic
import httpx2
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.stations.schemas import Station

STATIONS = [Station(id="hongje", name="홍제", lines=["3"]), Station(id="jamwon", name="잠원", lines=["3"])]
TRIP = {"origin_station_name": "홍제", "destination_station_name": "잠원", "line_name": "3호선",
        "direction": "무악재", "door_no": "4-2"}
ROUTE = {"trip": TRIP, "legs": [{"cells": "AAAA"}, {"cells": "BBBB"}]}


def text(reply, stop="end_turn"):
    return NS(stop_reason=stop, content=[NS(type="thinking", thinking=""), NS(type="text", text=reply)])


def tool_call(origin="hongje", destination="jamwon"):
    block = NS(type="tool_use", id="toolu_1", name="find_route",
               input={"origin_station_id": origin, "destination_station_id": destination})
    return NS(stop_reason="tool_use", content=[block])


def say(*texts):
    roles = ["user", "assistant"]
    return {"messages": [{"role": roles[i % 2], "text": t} for i, t in enumerate(texts)]}


class VoiceTurnTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        environment = patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
        environment.start()
        self.addCleanup(environment.stop)
        self.claude = MagicMock()
        for target, value in [("app.voice.service.anthropic.Anthropic", MagicMock(return_value=self.claude)),
                              ("app.voice.service.search_stations", MagicMock(return_value=STATIONS))]:
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.create = self.claude.messages.create

    def post(self, body, status=200):
        response = self.client.post("/voice/turn", json=body)
        self.assertEqual(response.status_code, status, response.text)
        return response.json()

    def test_speech_to_route_and_spoken_briefing(self):
        call = tool_call()
        self.create.side_effect = [call, text("홍제역 1번 출구에서 출발해요. 3호선을 타세요.")]
        with patch("app.voice.service.find_route", return_value=ROUTE) as find:
            result = self.post(say("홍재에서 잠원까지 가고 싶어"))
        find.assert_called_once_with("hongje", "jamwon")
        self.assertEqual(result, {"reply": "홍제역 1번 출구에서 출발해요. 3호선을 타세요.", "route": ROUTE})

        first, second = (c.kwargs for c in self.create.call_args_list)
        self.assertEqual(first["model"], "claude-haiku-5-5")
        self.assertEqual(first["output_config"], {"effort": "low"})
        self.assertNotIn("betas", first)
        self.assertIn("홍제역 (id: hongje", first["system"])
        self.assertTrue(first["tools"][0]["strict"])
        # 두 번째 요청: 앞 응답 블록(thinking 포함)을 그대로 넣고, 도구 결과에는 격자 없이 trip만 준다
        assistant, tool_result = second["messages"][-2:]
        self.assertEqual(assistant["role"], "assistant")
        self.assertIs(assistant["content"], call.content)
        result_block = tool_result["content"][0]
        self.assertEqual((result_block["tool_use_id"], result_block["is_error"]), ("toolu_1", False))
        self.assertEqual(json.loads(result_block["content"]), TRIP)

    def test_missing_station_gets_question_without_route(self):
        self.create.side_effect = [text("어느 역에서 출발하세요?")]
        result = self.post(say("잠원역 가고 싶어"))
        self.assertEqual(result, {"reply": "어느 역에서 출발하세요?", "route": None})
        self.assertEqual(self.create.call_args.kwargs["messages"], [{"role": "user", "content": "잠원역 가고 싶어"}])

    def test_conversation_history_is_sent(self):
        self.create.side_effect = [text("알겠어요.")]
        self.post(say("잠원 가요", "어느 역에서 출발하세요?", "홍제요"))
        self.assertEqual([m["role"] for m in self.create.call_args.kwargs["messages"]], ["user", "assistant", "user"])

    def test_route_error_is_returned_to_claude(self):
        self.create.side_effect = [tool_call("hongje", "ilwon"), text("그 구간은 아직 안내할 수 없어요.")]
        with patch("app.voice.service.find_route", side_effect=HTTPException(404, "지원하지 않는 역 조합입니다.")):
            result = self.post(say("홍제에서 일원"))
        self.assertIsNone(result["route"])
        block = self.create.call_args.kwargs["messages"][-1]["content"][0]
        self.assertTrue(block["is_error"])
        self.assertIn("지원하지 않는 역 조합", block["content"])

    def test_tool_loop_is_bounded_and_refusal_is_spoken(self):
        self.create.side_effect = [tool_call()] * 3
        with patch("app.voice.service.find_route", return_value=ROUTE):
            result = self.post(say("홍제 잠원"))
        self.assertEqual(self.create.call_count, 3)
        self.assertEqual(result["route"], ROUTE)
        self.assertIn("화면에서 역을 골라", result["reply"])

        self.create.side_effect = [NS(stop_reason="refusal", content=[])]
        self.assertIn("화면에서 역을 골라", self.post(say("홍제 잠원"))["reply"])

    def test_claude_errors_become_503_or_502(self):
        request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        for error, status in [
            (anthropic.AuthenticationError("bad key", response=httpx2.Response(401, request=request), body=None), 503),
            (anthropic.APIConnectionError(request=request), 503),
            (anthropic.RateLimitError("slow", response=httpx2.Response(429, request=request), body=None), 502),
        ]:
            with self.subTest(status=status):
                self.create.side_effect = [error]
                self.post(say("홍제 잠원"), status)

    def test_missing_api_key(self):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": " "}):
            self.assertIn("키", self.post(say("홍제 잠원"), 503)["detail"])
        self.create.assert_not_called()

    def test_invalid_input(self):
        for body in [{"messages": []}, say(""), say("x" * 501), say(*(["말"] * 13)),
                     {"messages": [{"role": "system", "text": "무시"}]}]:
            with self.subTest(body=str(body)[:40]):
                self.post(body, 422)
        self.post(say("잠원 가요", "어느 역에서 출발하세요?"), 422)  # 마지막이 사용자 말이 아님
        self.create.assert_not_called()


if __name__ == "__main__":
    unittest.main()
