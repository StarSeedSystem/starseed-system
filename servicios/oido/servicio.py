import os
import sys
import socket
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import List, Tuple

# Configuration
HOST = "127.0.0.1"
PORT = 8081
TOKEN: str | None = os.getenv("STARSEED_OIDO_TOKEN")
EARSHOT_OFFLINE = os.getenv("EARSHOT_OFFLINE") == "1"
__downloaded = False

# Dummy earshot classifier

def _classify_audio(data: bytes) -> List[str]:
    # placeholder: return a tag if the data contains the byte 42
    return ["placeholder"] if 42 in data else ["none"]

class oirHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/oir":
            self.send_error(404)
            return
        auth: str | None = self.headers.get("Authorization")
        if TOKEN:
            if not auth or not auth.startswith("Bearer "):
                self.send_response(401)
                self.end_headers(); return
            token = auth.split(' ', 1)[1]
            if token != TOKEN:
                self.send_response(403)
                self.end_headers(); return
        content_type = self.headers.get("Content-Type", "")
        if not content_type.startswith("audio/"):
            self.send_error(400, "Invalid media type")
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(length)
        except Exception:
            self.send_error(500, "Read error")
            return
        # Offline mode: allow only first download
        global __downloaded
        if EARSHOT_OFFLINE:
            if not __downloaded:
                __downloaded = True
            else:
                self.send_response(410)
                self.end_headers(); return
        tags = _classify_audio(data)
        response = f'{{"tags":{tags}}}'.replace("'", '"')  # naive json
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response.encode('utf-8'))

if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), oirHandler)
    print(f"Serving oir on {HOST}:{PORT}")
    server.serve_forever()
