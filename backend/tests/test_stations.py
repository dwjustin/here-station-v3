import json
from io import BytesIO
import unittest
from unittest.mock import patch
from urllib.error import URLError
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.stations.schemas import Station, StationMap
from app.stations.service import get_platform_poi_id


class StationTests(unittest.TestCase):
    def setUp(self):
        self.stations = [
            {"id": "ilwon", "name": "일원", "lines": ["3"]},
            {"id": "hakyeoul", "name": "학여울", "lines": ["3"]},
        ]
        self.rows = self.stations
        environment = patch.dict("os.environ", {
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SECRET_KEY": "test-secret",
        })
        environment.start()
        self.addCleanup(environment.stop)
        request = patch("app.stations.service.urlopen", side_effect=lambda *args, **kwargs:
                        BytesIO(json.dumps(self.rows).encode()))
        self.urlopen = request.start()
        self.addCleanup(request.stop)
        self.client = TestClient(app)

    def test_all_stations(self):
        for params in [{}, {"q": ""}, {"q": "   "}]:
            with self.subTest(params=params):
                response = self.client.get("/stations", params=params)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"stations": self.stations})
                request = self.urlopen.call_args.args[0]
                params = parse_qs(urlparse(request.full_url).query)
                self.assertEqual(params["select"], ["id,name,lines"])
                self.assertNotIn("or", params)
                self.assertEqual(request.get_header("Apikey"), "test-secret")
                self.assertEqual(self.urlopen.call_args.kwargs["timeout"], 5)

    def test_search_by_name_or_id(self):
        self.rows = [self.stations[0]]
        for query in ["일", "일원역", " 일원 ", "ILWON"]:
            with self.subTest(query=query):
                response = self.client.get("/stations", params={"q": query})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json(), {"stations": [self.stations[0]]})
                request = self.urlopen.call_args.args[0]
                params = parse_qs(urlparse(request.full_url).query)
                self.assertIn("name.ilike.", params["or"][0])
                self.assertIn("id.ilike.", params["or"][0])

    def test_no_matches(self):
        self.rows = []
        response = self.client.get("/stations", params={"q": "없는역"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"stations": []})

    def test_query_too_long(self):
        self.assertEqual(self.client.get("/stations", params={"q": "a" * 101}).status_code, 422)

    def test_database_changes_are_visible_without_restart(self):
        self.rows = []
        self.assertEqual(self.client.get("/stations", params={"q": "새로운"}).json(), {"stations": []})
        station = {"id": "new-station", "name": "새로운", "lines": ["3", "4"]}
        self.rows = [station]
        response = self.client.get("/stations", params={"q": "새로운"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"stations": [station]})

    def test_missing_configuration(self):
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": ""}):
            self.assertEqual(self.client.get("/stations").status_code, 503)
        self.urlopen.assert_not_called()

    def test_database_failure_does_not_leak_credentials(self):
        for error in [URLError("test-secret"), TimeoutError("test-secret")]:
            with self.subTest(error=type(error).__name__):
                self.urlopen.side_effect = error
                response = self.client.get("/stations")
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("test-secret", response.text)

    def test_invalid_database_response(self):
        for body in [b"not JSON", b'[{"id": ""}]']:
            with self.subTest(body=body):
                self.urlopen.side_effect = lambda *args, body=body, **kwargs: BytesIO(body)
                self.assertEqual(self.client.get("/stations").status_code, 502)

    def test_filter_value_is_quoted_and_escaped(self):
        self.rows = []
        self.client.get("/stations", params={"q": 'x%_,"id.not.is.null'})
        request = self.urlopen.call_args.args[0]
        params = parse_qs(urlparse(request.full_url).query)
        self.assertEqual(set(params), {"select", "order", "or"})
        pattern = json.dumps('%x\\%\\_,"id.not.is.null%')
        self.assertEqual(params["or"], [f"(name.ilike.{pattern},id.ilike.{pattern})"])

    def test_station_schema_rejects_invalid_data(self):
        for fields in [{"id": ""}, {"name": ""}, {"lines": []}, {"lines": [""]}]:
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                Station.model_validate({**self.stations[0], **fields})

    def test_platform_query_and_database_updates_are_used(self):
        row = {"station_id": "policehosp", "line_name": "3호선", "up_down": "상행", "platform_poi_id": "platform1"}
        self.rows = [row]
        self.assertEqual(get_platform_poi_id("policehosp", "3호선", "상행"), "platform1")
        request = self.urlopen.call_args.args[0]
        self.assertEqual(urlparse(request.full_url).path, "/rest/v1/station_platforms")
        params = parse_qs(urlparse(request.full_url).query)
        self.assertEqual(params["station_id"], ['in.("policehosp")'])
        self.assertEqual(params["line_name"], ['in.("3호선")'])
        self.assertEqual(params["up_down"], ['in.("상행")'])
        self.rows = [{**row, "platform_poi_id": "new-poi"}]
        self.assertEqual(get_platform_poi_id("policehosp", "3호선", "상행"), "new-poi")
        self.assertEqual(request.get_header("Apikey"), "test-secret")

    def test_missing_or_invalid_platform_database_rows(self):
        valid = {"station_id": "policehosp", "line_name": "3호선", "up_down": "상행", "platform_poi_id": "platform1"}
        for rows, status in [([], 422), ([valid, valid], 502), ([{**valid, "station_id": "other"}], 502),
                             ([{**valid, "line_name": "2호선"}], 502), ([{**valid, "up_down": "하행"}], 502),
                             ([{**valid, "platform_poi_id": " "}], 502), ([None], 502), (None, 502)]:
            with self.subTest(rows=rows):
                self.rows = rows
                with self.assertRaises(HTTPException) as error:
                    get_platform_poi_id("policehosp", "3호선", "상행")
                self.assertEqual(error.exception.status_code, status)

    def test_platform_database_failure_and_missing_configuration(self):
        for cause in [URLError("test-secret"), TimeoutError("test-secret")]:
            self.urlopen.side_effect = cause
            with self.assertRaises(HTTPException) as error:
                get_platform_poi_id("policehosp", "3호선", "상행")
            self.assertEqual(error.exception.status_code, 503)
            self.assertNotIn("test-secret", error.exception.detail)
        with patch.dict("os.environ", {"SUPABASE_SECRET_KEY": ""}), self.assertRaises(HTTPException) as error:
            get_platform_poi_id("policehosp", "3호선", "상행")
        self.assertEqual(error.exception.status_code, 503)

    def test_platform_filter_values_are_quoted_in_list(self):
        self.rows = []
        value = 'custom,"up_down"'
        with self.assertRaises(HTTPException):
            get_platform_poi_id(value, "3호선", "상행")
        params = parse_qs(urlparse(self.urlopen.call_args.args[0].full_url).query)
        self.assertEqual(params["station_id"], ["in.(" + json.dumps(value) + ")"])


class StationMapTests(unittest.TestCase):
    def test_map_metadata_is_separate_from_station(self):
        station_map = StationMap(
            id="07e876e1-06e6-4be2-b638-57b53637f19c",
            station_id="ilwon",
            version="v1",
            storage_bucket="station-maps",
            map_path="stations/ilwon/v1/map.json",
        )
        self.assertIsNone(station_map.glb_path)
        self.assertNotIn("nodes", station_map.model_dump())
        self.assertNotIn("map_path", Station.model_fields)

    def test_required_map_metadata_is_validated(self):
        valid = {
            "id": "07e876e1-06e6-4be2-b638-57b53637f19c",
            "station_id": "ilwon",
            "version": "v1",
            "storage_bucket": "station-maps",
            "map_path": "stations/ilwon/v1/map.json",
        }
        for field in valid:
            with self.subTest(field=field), self.assertRaises(ValidationError):
                StationMap.model_validate({**valid, field: ""})
