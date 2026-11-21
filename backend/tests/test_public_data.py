import json
import unittest
from io import BytesIO
from unittest.mock import patch
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException

from app.routing.public_data import get_fast_exit_rows
from tests.routing_fixtures import fast_exit_row


def page(rows, number=1, total=None, size=100):
    return {"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL_CODE"},
            "body": {"pageNo": number, "numOfRows": size, "totalCount": len(rows) if total is None else total,
                     "items": {"item": rows}}}}


class PublicDataTests(unittest.TestCase):
    def setUp(self):
        environment = patch.dict("os.environ", {"DATA_GO_KR_SERVICE_KEY": "fake%2Bkey%2F%3D"})
        environment.start()
        self.addCleanup(environment.stop)

    def test_all_pages_and_facility_fields_are_preserved(self):
        responses = [page([fast_exit_row("2-3"), fast_exit_row("4-2")], total=3, size=2),
                     page([fast_exit_row("8-2")], number=2, total=3, size=2)]
        with patch("app.routing.public_data.urlopen", side_effect=[BytesIO(json.dumps(p).encode()) for p in responses]) as fetch:
            rows = get_fast_exit_rows("잠원", "3호선")
        self.assertEqual([r["qckgffVhclDoorNo"] for r in rows], ["2-3", "4-2", "8-2"])
        self.assertIn("elvtrNo", rows[0])
        for index, call in enumerate(fetch.call_args_list, 1):
            params = parse_qs(urlparse(call.args[0].full_url).query)
            self.assertEqual(params["serviceKey"], ["fake+key/="])
            self.assertEqual(params["stnNm"], ["잠원"])
            self.assertEqual(params["pageNo"], [str(index)])
            self.assertEqual(call.kwargs["timeout"], 10)

    def test_single_item_object_is_supported(self):
        response = page([fast_exit_row()])
        response["response"]["body"]["items"]["item"] = fast_exit_row()
        with patch("app.routing.public_data.urlopen", return_value=BytesIO(json.dumps(response).encode())):
            self.assertEqual(len(get_fast_exit_rows("잠원", "3호선")), 1)

    def test_missing_key_and_empty_candidates(self):
        with patch.dict("os.environ", {"DATA_GO_KR_SERVICE_KEY": ""}), self.assertRaises(HTTPException) as error:
            get_fast_exit_rows("잠원", "3호선")
        self.assertEqual(error.exception.status_code, 503)
        response = page([])
        response["response"]["body"]["items"] = ""
        with patch("app.routing.public_data.urlopen", return_value=BytesIO(json.dumps(response).encode())), self.assertRaises(HTTPException) as error:
            get_fast_exit_rows("잠원", "3호선")
        self.assertEqual(error.exception.status_code, 422)

    def test_error_malformed_json_incomplete_and_repeated_pages_fail_without_key_leak(self):
        bad_code = {"response": {"header": {"resultCode": "30", "resultMsg": "fake+key/="}}}
        incomplete = page([], total=10)
        wrong_page = page([fast_exit_row()], number=2)
        wrong_fields = page([{"stnNm": "잠원"}])
        for payload in [bad_code, incomplete, wrong_page, wrong_fields, None]:
            with self.subTest(payload=payload), patch("app.routing.public_data.urlopen", return_value=BytesIO(json.dumps(payload).encode())), self.assertRaises(HTTPException) as error:
                get_fast_exit_rows("잠원", "3호선")
            self.assertEqual(error.exception.status_code, 502)
            self.assertNotIn("fake", error.exception.detail)
        for failure in [URLError("fake+key/="), TimeoutError("fake+key/=")]:
            with patch("app.routing.public_data.urlopen", side_effect=failure), self.assertRaises(HTTPException) as error:
                get_fast_exit_rows("잠원", "3호선")
            self.assertEqual(error.exception.status_code, 502)
            self.assertNotIn("fake", error.exception.detail)
