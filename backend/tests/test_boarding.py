import unittest

from app.routing.boarding import fast_exit_doors
from tests.routing_fixtures import fast_exit_row


class BoardingTests(unittest.TestCase):
    def test_filters_exact_station_line_direction_and_next_station(self):
        row = fast_exit_row()
        wrong = [{**row, key: value} for key, value in (
            ('stnNm', '홍제'), ('lineNm', '2호선'), ('upbdnbSe', '상행'),
            ('drtnInfo', '신사'), ('qckgffVhclDoorNo', '0-1'))]
        self.assertEqual(fast_exit_doors(wrong + [row, fast_exit_row('10-1'), fast_exit_row('2-3'), row],
                                        '3호선', '하행', '잠원', '고속터미널'), ['2-3', '4-2', '10-1'])
        with self.assertRaisesRegex(ValueError, '후보'):
            fast_exit_doors(wrong, '3호선', '하행', '잠원', '고속터미널')
