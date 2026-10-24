import unittest
from unittest.mock import patch, MagicMock
import io
import json
from http.server import HTTPServer
import threading
import urllib.request
import urllib.error
import os

from servicios.oido.servicio import oirHandler, HOST

class TestOirService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer((HOST, 0), oirHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever)
        cls.thread.daemon = True
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_post_oir_without_token(self):
        url = f"http://{HOST}:{self.port}/oir"
        req = urllib.request.Request(url, data=b"some dummy audio with byte \x2a", headers={"Content-Type": "audio/wav"})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data, {"tags": ["placeholder"]})

    def test_post_oir_wrong_path(self):
        url = f"http://{HOST}:{self.port}/other"
        req = urllib.request.Request(url, data=b"audio", headers={"Content-Type": "audio/wav"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 404)

if __name__ == '__main__':
    unittest.main()
