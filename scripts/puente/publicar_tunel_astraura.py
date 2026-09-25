# -*- coding: utf-8 -*-
"""Publica en Supabase el túnel vivo de la Astraura de esta Mac, para la web y la app.

(2026-09-25) Alex: «la IA de Astraura 1.58 no está respondiendo en ningún medio». La web
(Vercel) y la app de Android llegaban a Astraura por la nube de Google (Cloud Run); Alex
desactivó la facturación de ese proyecto tras un cargo de 4.000 este mes y pidió
alternativas GRATUITAS. La Mac ya expone su backend por un túnel rápido de Cloudflare
(`tunnel_monitor.sh` del repo de Astraura), pero su URL cambia en cada arranque y el OS
publicado no la conocía. Esto la deja en `astraura_state` (clave `tunel_publico`), que solo
escribe el service_role (RLS), y el proxy del OS la lee (`src/lib/astraura/destino-nube.ts`).

Lo lanza el director de orquestación cada 5 min. Solo escribe si la URL cambió o cada 30 min
como latido, y con `return=minimal`: cero tráfico de salida. Nunca imprime claves.
"""
import datetime as dt
import json
import os
import socket
import sys
import urllib.parse
import urllib.request

TUNEL = os.environ.get("ASTRAURA_TUNEL_JSON") or "/Users/alex/Documents/IA 1.58 bit/data/active_tunnel.json"
CONFIG = os.path.expanduser("~/.astraura/supabase_astraura.json")
ESTADO = os.path.expanduser("~/.starseed/tunel-astraura.json")
CLAVE = "tunel_publico"
LATIDO_S = 30 * 60


def url_valida(url) -> bool:
    """PURA: solo https y un host de túnel de Cloudflare (o los de ASTRAURA_TUNEL_HOSTS)."""
    try:
        p = urllib.parse.urlparse(str(url or ""))
    except ValueError:
        return False
    extra = [h.strip() for h in (os.environ.get("ASTRAURA_TUNEL_HOSTS") or "").split(",") if h.strip()]
    host = (p.hostname or "").lower()
    return p.scheme == "https" and bool(host) and (
        host.endswith(".trycloudflare.com") or host in extra) and not p.path.strip("/")


def decidir(url, vivo, previo, ahora, latido_s=LATIDO_S):
    """PURA: (publicar: bool, motivo). Solo una URL válida y viva se publica."""
    if not url_valida(url):
        return False, "sin túnel válido"
    if not vivo:
        return False, "el túnel no responde"
    previo = previo if isinstance(previo, dict) else {}
    if previo.get("url") != url:
        return True, "túnel nuevo"
    if ahora - float(previo.get("t") or 0) >= latido_s:
        return True, "latido"
    return False, "sin cambios"


def responde(url, timeout=8.0) -> bool:
    try:
        with urllib.request.urlopen(url.rstrip("/") + "/api/ping", timeout=timeout) as r:
            return r.status == 200
    except (OSError, socket.timeout, ValueError):
        return False


def _leer(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def publicar(url) -> bool:
    cfg = _leer(CONFIG)
    base, clave = (cfg.get("supabase_url") or "").rstrip("/"), cfg.get("service_role_key") or ""
    if not base or not clave:
        return False
    fila = {"key": CLAVE, "data": {"url": url, "maquina": socket.gethostname().split(".")[0],
                                   "publicado": dt.datetime.now(dt.timezone.utc).isoformat()},
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    req = urllib.request.Request(
        base + "/rest/v1/astraura_state?on_conflict=key", json.dumps(fila).encode(),
        {"apikey": clave, "Authorization": "Bearer " + clave, "Content-Type": "application/json",
         "Prefer": "resolution=merge-duplicates,return=minimal"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except OSError:
        return False


def main() -> int:
    import time
    url = (_leer(TUNEL).get("url") or "").rstrip("/")
    previo = _leer(ESTADO)
    hazlo, motivo = decidir(url, responde(url) if url_valida(url) else False, previo, time.time())
    if hazlo and publicar(url):
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        with open(ESTADO, "w", encoding="utf-8") as f:
            json.dump({"url": url, "t": time.time()}, f)
        os.chmod(ESTADO, 0o600)
        print("túnel publicado (%s)" % motivo)
    else:
        print("no publico: %s" % motivo)
    return 0


if __name__ == "__main__":
    sys.exit(main())
