#!/usr/bin/env python3
"""Servidor mínimo del medio «nube-hf» (puerto 7860, el que exige un Space).

Rutas (GET):
  /            → texto: quién soy y cuántos commits hay por entregar
  /estado      → JSON: latidos, agentes, commits por entregar, cola viva, salud
  /bundle      → `git bundle` con origin/main..main (los commits del enjambre de la
                 nube), para que la Mac los traiga con `scripts/puente/nube-hf.py traer`
  /log         → últimas 200 líneas del log del enjambre
/bundle y /log exigen la cabecera `X-Starseed-Token` igual al secreto
STARSEED_NUBE_TOKEN (o, si no existe, STARSEED_LANZADOR_SECRETO). Sin token válido: 403.
Nunca devuelve claves ni rutas del disco fuera del repo.
"""
import http.server
import json
import os
import subprocess
import time

ROOT = os.environ.get("STARSEED_ROOT") or os.path.expanduser("~/starseed-system")
LOG = os.path.expanduser("~/enjambre-nube-hf.log")
TOKEN = (os.environ.get("STARSEED_NUBE_TOKEN") or os.environ.get("STARSEED_LANZADOR_SECRETO") or "").strip()
PUERTO = int(os.environ.get("PORT") or 7860)


def _git(*args, timeout=60):
    try:
        p = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout
    except Exception as e:  # noqa: BLE001
        return 1, str(e)


def por_entregar():
    rc, out = _git("log", "--oneline", "origin/main..main")
    return [l for l in out.splitlines() if l.strip()] if rc == 0 else []


def estado():
    latidos = {}
    try:
        olas = os.path.join(ROOT, "starseed_memory_root", "olas")
        for n in os.listdir(olas):
            if n.startswith("latidos-") and n.endswith(".json"):
                latidos = json.load(open(os.path.join(olas, n)))
    except Exception:
        pass
    vivo = subprocess.run(["pgrep", "-f", "bin/starseed-enjambre.py"], capture_output=True, text=True).stdout.strip()
    return {
        "medio": "nube-hf",
        "t": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "orquestador_vivo": bool(vivo),
        "agentes": len(latidos) if isinstance(latidos, dict) else 0,
        "latidos": latidos,
        "commits_por_entregar": por_entregar(),
        "cpu": os.cpu_count(),
    }


class Manejador(http.server.BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        cuerpo = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _autorizado(self):
        return bool(TOKEN) and self.headers.get("X-Starseed-Token", "") == TOKEN

    def do_GET(self):  # noqa: N802
        if self.path == "/estado":
            return self._json(estado())
        if self.path == "/bundle":
            if not self._autorizado():
                return self._json({"error": "token"}, 403)
            if not por_entregar():
                return self._json({"vacio": True})
            ruta = "/tmp/nube-hf.bundle"
            rc, _ = _git("bundle", "create", ruta, "origin/main..main", timeout=120)
            if rc != 0 or not os.path.exists(ruta):
                return self._json({"error": "bundle"}, 500)
            datos = open(ruta, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return None
        if self.path == "/log":
            if not self._autorizado():
                return self._json({"error": "token"}, 403)
            try:
                lineas = open(LOG, encoding="utf-8", errors="replace").read().splitlines()[-200:]
            except OSError:
                lineas = []
            return self._json({"log": lineas})
        e = estado()
        texto = "StarSeed OS · enjambre nube-hf · %d agentes · %d commits por entregar\n" % (e["agentes"], len(e["commits_por_entregar"]))
        cuerpo = texto.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)
        return None

    def log_message(self, *a):  # silencio: el log útil es el del enjambre
        return


if __name__ == "__main__":
    http.server.ThreadingHTTPServer(("0.0.0.0", PUERTO), Manejador).serve_forever()
