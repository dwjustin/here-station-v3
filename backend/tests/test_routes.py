import json
import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.routing.service import ROUTE_EXAMPLE


class RouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_example_route(self):
        response = self.client.post("/routes", json={
            "origin_station_id": "ilwon",
            "destination_station_id": "hakyeoul",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), json.loads(ROUTE_EXAMPLE.read_text(encoding="utf-8")))

    def test_unsupported_route(self):
        for origin, destination in [("hakyeoul", "ilwon"), ("unknown", "hakyeoul"), ("ilwon", "ilwon")]:
            with self.subTest(origin=origin, destination=destination):
                response = self.client.post("/routes", json={
                    "origin_station_id": origin,
                    "destination_station_id": destination,
                })
                self.assertEqual(response.status_code, 404)

    def test_invalid_request(self):
        for payload in [{}, {"origin_station_id": "ilwon"}, {
            "origin_station_id": "",
            "destination_station_id": "hakyeoul",
        }, {"origin_station_id": 123, "destination_station_id": "hakyeoul"}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/routes", json=payload).status_code, 422)
