import unittest
from unittest.mock import call, patch

from fastapi import HTTPException

from fastapi.testclient import TestClient

from app.main import app
from tests.routing_fixtures import fast_exit_row, platform_grid, trip


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        resolver = patch("app.routing.service.resolve_trip", return_value=trip())
        self.resolve = resolver.start()
        self.addCleanup(resolver.stop)
        platform_lookup = patch("app.routing.service.get_platform_poi_id", return_value="platform1")
        self.platform_lookup = platform_lookup.start()
        self.addCleanup(platform_lookup.stop)
        self.request = {"origin_station_id": "hongje", "destination_station_id": "jamwon"}

    def test_health(self):
        self.assertEqual(self.client.get("/health").json(), {"status": "ok"})

    def test_route_response_contract(self):
        origin, destination = platform_grid("hongje"), platform_grid("jamwon")
        with patch("app.routing.service.load_map", side_effect=[origin, destination]), \
             patch("app.routing.service.get_fast_exit_rows", return_value=[fast_exit_row("8-4"), fast_exit_row()]):
            response = self.client.post("/routes", json=self.request)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual([leg["station_id"] for leg in result["legs"]], ["hongje", "jamwon"])
        self.assertEqual(result["trip"]["destination_station_name"], "잠원")
        self.assertEqual(result["trip"]["direction"], "무악재")
        self.assertEqual(result["trip"]["door_no"], "4-2")
        self.assertEqual(result["trip"]["origin_walk_m"], 1.0)
        self.assertEqual(result["trip"]["destination_walk_m"], 0.5)
        self.assertEqual(result["legs"][0]["goal"]["x"], origin.xyz(4)[0])
        self.assertEqual(result["legs"][1]["start"]["x"], destination.xyz(2)[0])

    def test_missing_map_file(self):
        with patch("app.routing.service.load_map", side_effect=FileNotFoundError):
            self.assertEqual(self.client.post("/routes", json=self.request).status_code, 503)

    def test_route_does_not_need_door_coordinates(self):
        origin, destination = platform_grid("hongje"), platform_grid("jamwon")
        with patch("app.routing.service.load_map", side_effect=[origin, destination]), \
             patch("app.routing.service.get_fast_exit_rows", return_value=[fast_exit_row()]), \
             patch("app.routing.grid.read_map_file", side_effect=FileNotFoundError):
            response = self.client.post("/routes", json=self.request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["legs"][0]["platform"]["id"], "platform1")
        self.assertEqual(response.json()["legs"][1]["platform"]["access_name"], "계단 1 아래")

    def test_invalid_request(self):
        for payload in [{}, {"origin_station_id": "hongje"}, {**self.request, "origin_station_id": ""},
                        {**self.request, "origin_station_id": 123}, {**self.request, "origin_station_id": "../hongje"}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/routes", json=payload).status_code, 422)

    def test_route_uses_each_station_database_platform(self):
        origin, destination = platform_grid("hongje"), platform_grid("jamwon")
        destination.doc["pois"].append({**destination.doc["pois"][1], "id": "platform2"})
        self.platform_lookup.side_effect = ["platform1", "platform2"]
        with patch("app.routing.service.load_map", side_effect=[origin, destination]), \
             patch("app.routing.service.get_fast_exit_rows", return_value=[fast_exit_row()]):
            response = self.client.post("/routes", json=self.request)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["legs"][1]["platform"]["id"], "platform2")
        self.assertEqual(self.platform_lookup.call_args_list, [call("hongje", "3호선", "하행"), call("jamwon", "3호선", "하행")])

    def test_missing_database_mapping_does_not_fall_back_to_single_platform(self):
        self.platform_lookup.side_effect = HTTPException(status_code=422, detail="DB에 승강장 연결이 없습니다.")
        with patch("app.routing.service.load_map", side_effect=[platform_grid("hongje"), platform_grid("jamwon")]), \
             patch("app.routing.service.get_fast_exit_rows", return_value=[fast_exit_row()]):
            response = self.client.post("/routes", json=self.request)
        self.assertEqual(response.status_code, 422)
        self.assertIn("DB에 승강장 연결", response.json()["detail"])
