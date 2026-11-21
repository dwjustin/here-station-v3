import hashlib
import json
import tempfile
import unittest
from array import array
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from fastapi.testclient import TestClient

from app.main import app
from app.routing import grid, service
from tests.routing_fixtures import trip


class MapLoadingTests(unittest.TestCase):
    def setUp(self):
        self.raw = json.dumps({
            "id": "hongje", "x0": 0, "z0": 0, "w": 2, "cell": 0.25,
            "levels": [{"name": "1F", "h": 0}], "pois": [],
            "nodes": {"cell": grid.pack(array("i", [0, 1])), "h": grid.pack(array("h", [0, 0]))},
        }).encode()
        environment = patch.dict("os.environ", {
            "RENDER": "true", "SUPABASE_URL": "https://example.supabase.co/",
            "SUPABASE_SECRET_KEY": "sb_secret_test", "STORAGE_BUCKET": "station-maps",
        }, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        download = patch.object(grid, "urlopen", side_effect=lambda *a, **kw: BytesIO(self.raw))
        self.download = download.start()
        self.addCleanup(download.stop)
        resolver = patch.object(service, "resolve_trip", return_value=trip())
        resolver.start()
        self.addCleanup(resolver.stop)
        self.client = TestClient(app)

    def test_render_downloads_each_map_and_preserves_revision(self):
        with patch.object(Path, "read_bytes", side_effect=AssertionError("Render must not read local maps")):
            for station_id in ["hongje", "jamwon"]:
                with self.subTest(station_id=station_id):
                    doc = json.loads(self.raw)
                    doc["id"] = station_id
                    self.raw = json.dumps(doc).encode()
                    result = grid.load_map(station_id)
                    self.assertEqual(list(result.cells), [0, 1])
                    self.assertEqual(result.neighbors, [[(1, 0.25)], [(0, 0.25)]])
                    self.assertEqual(result.revision, hashlib.sha256(self.raw).hexdigest())
                    request = self.download.call_args.args[0]
                    self.assertEqual(request.full_url,
                        f"https://example.supabase.co/storage/v1/object/authenticated/station-maps/{station_id}.json")
                    self.assertEqual(request.get_header("Apikey"), "sb_secret_test")
                    self.assertIsNone(request.get_header("Authorization"))
                    self.assertEqual(self.download.call_args.kwargs["timeout"], 10)

    def test_local_uses_files_even_with_supabase_configured(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(grid, "MAP_DIR", Path(directory)):
            Path(directory, "hongje.json").write_bytes(self.raw)
            for value in ["", "false"]:
                with patch.dict("os.environ", {"RENDER": value}):
                    self.assertEqual(grid.load_map("hongje").revision, hashlib.sha256(self.raw).hexdigest())
                    with self.assertRaises(FileNotFoundError):
                        grid.load_map("jamwon")
        self.download.assert_not_called()

    def test_missing_storage_configuration(self):
        for name in ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "STORAGE_BUCKET"]:
            with self.subTest(name=name), patch.dict("os.environ", {name: " "}):
                self.assertEqual(self.request_route().status_code, 503)
        self.download.assert_not_called()

    def test_download_errors_do_not_leak_credentials(self):
        for error in [URLError("sb_secret_test"), TimeoutError("sb_secret_test"),
                      HTTPError("https://example.supabase.co", 404, "missing", None, None)]:
            with self.subTest(error=type(error).__name__):
                self.download.side_effect = error
                response = self.request_route()
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("sb_secret_test", response.text)

    def test_invalid_storage_map_returns_502(self):
        for body in [b"not json", b"null", b"{}", b'{"nodes": {}}']:
            with self.subTest(body=body):
                self.raw = body
                self.assertEqual(self.request_route().status_code, 502)

    def test_invalid_grid_and_poi_values_return_502(self):
        valid = json.loads(self.raw)
        invalid = [
            {**valid, "w": 0}, {**valid, "cell": -0.25}, {**valid, "levels": []},
            {**valid, "nodes": {**valid["nodes"], "h": ""}},
            {**valid, "pois": [{"kind": "stairs", "x": 0, "z": 0, "h": 0}]},
        ]
        for doc in invalid:
            with self.subTest(doc=doc):
                self.raw = json.dumps(doc).encode()
                self.assertEqual(self.request_route().status_code, 502)

    def request_route(self):
        return self.client.post("/routes", json={
            "origin_station_id": "hongje", "destination_station_id": "jamwon",
        })
