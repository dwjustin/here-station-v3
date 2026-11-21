import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.routing.transit import resolve_trip
from app.stations.schemas import Station


class TransitTests(unittest.TestCase):
    def resolve(self, origin_name, destination_name, origin_lines=("3",), destination_lines=("3",)):
        stations = {"arbitrary-a": Station(id="arbitrary-a", name=origin_name, lines=list(origin_lines)),
                    "arbitrary-z": Station(id="arbitrary-z", name=destination_name, lines=list(destination_lines))}
        with patch("app.routing.transit.search_stations", side_effect=lambda key: [stations[key]]):
            return resolve_trip("arbitrary-a", "arbitrary-z")

    def test_both_directions_follow_official_order_not_ids(self):
        down = self.resolve("홍제", "잠원")
        self.assertEqual((down.line_name, down.up_down, down.direction, down.destination_next_station),
                         ("3호선", "하행", "무악재", "고속터미널"))
        up = self.resolve("잠원", "홍제")
        self.assertEqual((up.up_down, up.direction, up.destination_next_station), ("상행", "신사", "녹번"))
        self.assertEqual(self.resolve("일원", "학여울").direction, "대청")

    def test_terminal_has_no_invented_next_station(self):
        self.assertIsNone(self.resolve("경찰병원", "오금").destination_next_station)

    def test_same_station_unknown_and_transfer_are_rejected(self):
        with self.assertRaises(HTTPException) as error:
            resolve_trip("same", "same")
        self.assertEqual(error.exception.status_code, 422)
        with patch("app.routing.transit.search_stations", return_value=[]), self.assertRaises(HTTPException) as error:
            resolve_trip("missing", "other")
        self.assertEqual(error.exception.status_code, 404)
        for args, reason in [(('홍제', '성수', ('3',), ('2',)), '환승'),
                             (('성수', '구의', ('2',), ('2',)), '공식 노선'),
                             (('잘못된이름', '홍제'), '역 이름')]:
            with self.subTest(args=args), self.assertRaises(HTTPException) as error:
                self.resolve(*args)
            self.assertIn(reason, error.exception.detail)
