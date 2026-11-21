import unittest

from app.routing.places import platform_access
from tests.routing_fixtures import platform_grid


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
