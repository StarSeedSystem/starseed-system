import os
import unittest
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer
import json

from servicios.oido.servicio import oirHandler, HOST, TOKEN, EARSHOT_OFFLINE

class TestOirServiceOffline(unittest.TestCase):
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

    def test_offline_first_download(self):
        if not EARSHOT_OFFLINE:
            self.skipTest("EARSHOT_OFFLINE not set")
        url = f"http://{HOST}:{self.port}/oir"
        req = urllib.request.Request(url, data=b"dummy", headers={"Content-Type": "audio/wav"})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
        # second request should 410
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 410)

    def test_token_protection(self):
        if not TOKEN:
            self.skipTest("TOKEN not set")
        url = f"http://{HOST}:{self.port}/oir"
        # without token
        req = urllib.request.Request(url, data=b"dummy", headers={"Content-Type": "audio/wav"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 401)
        # correct token
        req = urllib.request.Request(url, data=b"dummy", headers={"Content-Type": "audio/wav", "Authorization": f"Bearer {TOKEN}"})
        with urllib.request.urlopen(req) as resp:
            self.assertEqual(resp.status, 200)

if __name__ == "__main__":
    unittest.main()
