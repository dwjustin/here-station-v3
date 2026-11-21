import json
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routing.places import door_nodes, load_door_positions, platform_access
from tests.routing_fixtures import door_data, make_grid, platform_grid


class DoorPositionTests(unittest.TestCase):
    def setUp(self):
        self.grid = make_grid("hongje")
        self.profile = door_data(self.grid, 1, "무악재")
        self.doc = {"station_id": "hongje", "map_revision": self.grid.revision, "profiles": [self.profile]}

    def test_sidecar_matches_line_direction_next_station_and_map_revision(self):
        with patch("app.routing.places.read_map_file", return_value=json.dumps(self.doc).encode()) as read:
            data = load_door_positions(self.grid, "3호선", "하행", "무악재")
        read.assert_called_once_with("hongje.doors.json")
        self.assertEqual(door_nodes(self.grid, data, "3호선", "하행")["4-2"], 1)

    def test_missing_wrong_direction_and_duplicate_profiles_are_unsupported(self):
        with patch("app.routing.places.read_map_file", side_effect=FileNotFoundError), self.assertRaises(HTTPException) as error:
            load_door_positions(self.grid, "3호선", "하행", "무악재")
        self.assertEqual(error.exception.status_code, 422)
        for profiles in [[], [self.profile, self.profile]]:
            with patch("app.routing.places.read_map_file", return_value=json.dumps({**self.doc, "profiles": profiles}).encode()), self.assertRaises(HTTPException) as error:
                load_door_positions(self.grid, "3호선", "하행", "무악재")
            self.assertEqual(error.exception.status_code, 422)

    def test_malformed_sidecar(self):
        for raw in [b"not json", b"null", b"{}", b'{"profiles":[null]}']:
            with self.subTest(raw=raw), patch("app.routing.places.read_map_file", return_value=raw), self.assertRaises(HTTPException) as error:
                load_door_positions(self.grid, "3호선", "하행", "무악재")
            self.assertEqual(error.exception.status_code, 502)


class PlatformTests(unittest.TestCase):
    def test_area_access_and_distance_use_existing_graph(self):
        grid = platform_grid("hongje")
        area = platform_access(grid, 0, "platform1")
        self.assertEqual(area["nodes"], [2, 3, 4, 5])
        self.assertEqual(area["access"], 2)
        self.assertEqual(area["walk_m"], 0.5)
        self.assertEqual(area["access_name"], "계단 1 아래")

    def test_missing_duplicate_and_disconnected_poi_rejected(self):
        grid = platform_grid("other")
        with self.assertRaisesRegex(ValueError, "DB의 승강장 POI"):
            platform_access(grid, 0, "platform2")
        grid.doc["pois"].append(dict(grid.doc["pois"][1]))
        with self.assertRaisesRegex(ValueError, "하나로"):
            platform_access(grid, 0, "platform1")
        grid.doc["pois"].pop()
        grid.neighbors[1] = [(0, 0.25)]
        grid.neighbors[2] = [(3, 0.25)]
        with self.assertRaisesRegex(ValueError, "연결"):
            platform_access(grid, 0, "platform1")

    def test_uses_supplied_poi_id_for_any_station(self):
        grid = platform_grid("new-station")
        grid.doc["pois"].append({**grid.doc["pois"][1], "id": "platform-new"})
        self.assertEqual(platform_access(grid, 0, "platform-new")["poi"]["id"], "platform-new")

    def test_missing_platform_or_stairs_is_not_supported(self):
        for kind in ("platform", "stairs"):
            grid = platform_grid("hongje")
            grid.doc["pois"] = [p for p in grid.doc["pois"] if p["kind"] != kind]
            with self.assertRaises(ValueError):
                platform_access(grid, 0, "platform1")
