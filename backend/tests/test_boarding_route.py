import unittest
from copy import deepcopy

from app.routing.boarding import choose_boarding_points
from tests.routing_fixtures import door_data, fast_exit_row, make_grid


class BoardingRouteTests(unittest.TestCase):
    def setUp(self):
        self.origin, self.destination = make_grid("hongje"), make_grid("jamwon")
        self.options = {
            "rows": [fast_exit_row("1-1"), fast_exit_row()],
            "line_name": "3호선", "up_down": "하행", "destination_station_name": "잠원",
            "destination_next_station": "고속터미널",
            "origin_grid": self.origin, "destination_grid": self.destination,
            "origin_exit": 0, "destination_exit": 0,
            "origin_doors": door_data(self.origin, 1, "무악재"),
            "destination_doors": door_data(self.destination, 2, "고속터미널"),
        }

    def test_shortest_combined_walk_is_selected(self):
        selected = choose_boarding_points(**self.options)
        self.assertEqual((selected["door_no"], selected["boarding_node"], selected["alighting_node"]), ("4-2", 1, 2))
        self.assertEqual(selected["total_walk_m"], 0.75)

    def test_invalid_coordinate_metadata_is_rejected(self):
        for key, value in [("map_revision", "old"), ("up_down", "상행"), ("station_id", "other"),
                           ("verified", False), ("source", ""), ("position_reference", "reverse-numbering")]:
            data = {**self.options["origin_doors"], key: value}
            with self.subTest(key=key), self.assertRaises(ValueError):
                choose_boarding_points(**{**self.options, "origin_doors": data})

    def test_wrong_direction_line_station_and_next_station_do_not_match(self):
        for key, value in [("upbdnbSe", "상행"), ("lineNm", "2호선"), ("stnNm", "다른역"), ("drtnInfo", "신사")]:
            rows = [{**fast_exit_row(), key: value}]
            with self.subTest(key=key), self.assertRaises(ValueError):
                choose_boarding_points(**{**self.options, "rows": rows})

    def test_wall_wrong_height_and_disconnected_doors_are_excluded(self):
        for position in [{"x": -1, "z": 0.125, "h": 0}, {"x": 0.375, "z": 0.125, "h": 3},
                         {"x": 3.125, "z": 0.125, "h": 0}]:
            data = {**self.options["origin_doors"], "positions": {"4-2": position}}
            with self.subTest(position=position), self.assertRaises(ValueError):
                choose_boarding_points(**{**self.options, "origin_doors": data})
        isolated = make_grid("hongje", (0, 1, 2, 3, 4, 20))
        data = {**door_data(isolated, 5, "무악재"), "positions": {"4-2": dict(zip(("x", "z", "h"), isolated.xyz(5)))}}
        with self.assertRaises(ValueError):
            choose_boarding_points(**{**self.options, "origin_grid": isolated, "origin_doors": data})

    def test_no_candidate_duplicate_door_and_nonfinite_coordinates_fail(self):
        with self.assertRaises(ValueError):
            choose_boarding_points(**{**self.options, "rows": []})
        for key, position in [("04-2", {"x": 0.375, "z": 0.125, "h": 0}),
                              ("2-2", {"x": float("nan"), "z": 0, "h": 0})]:
            data = deepcopy(self.options["origin_doors"])
            data["positions"][key] = position
            with self.subTest(key=key), self.assertRaises(ValueError):
                choose_boarding_points(**{**self.options, "origin_doors": data})
