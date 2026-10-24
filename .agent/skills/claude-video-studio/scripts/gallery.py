"""gallery.py: open the style gallery in your browser (Stage A).

usage: python3 scripts/gallery.py [--no-open] [--port 0] [--minutes 90]

Serves the gallery/ folder on a free local port (only on this computer, 127.0.0.1),
opens it in your default browser, and prints the address. It stops by itself after
--minutes (default 90). Standard library only. Supports video seeking (HTTP Range)."""
import argparse, os, re, socket, sys, threading, webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'gallery')


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        rng = self.headers.get('Range')
        if not rng or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        m = re.match(r'bytes=(\d*)-(\d*)', rng)
        if not m:
            return super().send_head()
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2) or 0))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._left = end - start + 1
        return f

    def copyfile(self, src, dst):
        left = getattr(self, '_left', None)
        if left is None:
            return super().copyfile(src, dst)
        while left > 0:
            buf = src.read(min(65536, left))
            if not buf:
                break
            try:
                dst.write(buf)
            except (BrokenPipeError, ConnectionResetError):
                break
            left -= len(buf)
        self._left = None

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass


def free_port(want):
    if want:
        return want
    for p in range(8770, 8800):
        with socket.socket() as s:
            try:
                s.bind(('127.0.0.1', p))
                return p
            except OSError:
                continue
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


ap = argparse.ArgumentParser()
ap.add_argument('--no-open', action='store_true')
ap.add_argument('--port', type=int, default=0)
ap.add_argument('--minutes', type=float, default=90)
a = ap.parse_args()
port = free_port(a.port)
httpd = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=ROOT))
url = f'http://127.0.0.1:{port}/'
print(f'Gallery: {url}  (stops by itself in {a.minutes:g} min)', flush=True)
if not a.no_open:
    webbrowser.open(url)
threading.Timer(a.minutes * 60, httpd.shutdown).start()
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    pass
os._exit(0)
