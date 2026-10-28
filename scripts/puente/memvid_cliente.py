#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""memvid_cliente · cliente Python (stdlib) para cápsulas Memvid en 127.0.0.1:4490.

Contrato: architecture/memvid-capsulas.md §4, §8 tarea G.
Núcleo en Rust en servidor propio; este cliente usa solo urllib.
"""

import json
import os
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


@dataclass
class Frame:
    frame_id: int
    title: Optional[str]
    text: str
    uri: Optional[str]
    ts: int
    score: Optional[float] = None


@dataclass
class Salud:
    ok: bool
    capsules: int
    version: str


SERVER_URL = "http://127.0.0.1:4490"
TOKEN_PATH = os.path.expanduser("~/.starseed/memvid.token")
TIMEOUT = 1.5


def _leer_token() -> Optional[str]:
    try:
        with open(TOKEN_PATH, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return None


def _peticion(ruta: str, metodo: str = "GET", cuerpo: Optional[dict] = None) -> Optional[dict]:
    token = _leer_token()
    if not token:
        return None
    url = f"{SERVER_URL}{ruta}"
    headers = {"X-StarSeed-Token": token, "Content-Type": "application/json"}
    data = json.dumps(cuerpo).encode("utf-8") if cuerpo else None
    req = urllib.request.Request(url, data=data, headers=headers, method=metodo)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def salud() -> Optional[Salud]:
    """Comprueba si el servidor de cápsulas está vivo."""
    r = _peticion("/salud")
    if not r:
        return None
    return Salud(ok=r.get("ok", False), capsules=r.get("capsules", 0), version=r.get("version", ""))


def poner(capsula: str, texto: str, titulo: Optional[str] = None, uri: Optional[str] = None,
          etiquetas: Optional[dict] = None, ts: Optional[int] = None) -> Optional[int]:
    """Añade un fotograma a la cápsula y hace commit. Devuelve frame_id o None."""
    cuerpo: dict = {"texto": texto}
    if titulo:
        cuerpo["titulo"] = titulo
    if uri:
        cuerpo["uri"] = uri
    if etiquetas:
        cuerpo["etiquetas"] = etiquetas
    if ts:
        cuerpo["ts"] = str(ts)
    r = _peticion(f"/capsulas/{capsula}/poner", "POST", cuerpo)
    if not r:
        return None
    return r.get("frame")


def buscar(capsula: str, consulta: str, k: int = 3) -> list[Frame]:
    """Busca en la cápsula. Devuelve lista de Frame (vacía si no hay servidor)."""
    r = _peticion(f"/capsulas/{capsula}/buscar", "POST", {"consulta": consulta, "k": k})
    if not r:
        return []
    aciertos = r.get("aciertos", [])
    return [
        Frame(
            frame_id=h.get("frame_id", 0),
            title=h.get("titulo"),
            text=h.get("texto", ""),
            uri=h.get("uri"),
            ts=h.get("ts", 0),
            score=h.get("score"),
        )
        for h in aciertos
    ]


def _nombre_capsula_agente(agente: str) -> str:
    ahora = datetime.now(timezone.utc)
    trimestre = (ahora.month - 1) // 3 + 1
    return f"agente-{agente}-{ahora.year}T{trimestre}.mv2"


def _siguiente_paso(agente: str, sesion: str) -> int:
    """Cuenta pasos previos en la sesión para numerar el siguiente."""
    capsula = _nombre_capsula_agente(agente)
    frames = buscar(capsula, f"sesion:{sesion}", k=100)
    return len([f for f in frames if f.uri and f"sesion/{sesion}/" in f.uri]) + 1


def anotar_paso(agente: str, sesion: str, texto: str) -> Optional[int]:
    """Escribe un paso de agente en su cápsula. Devuelve frame_id o None."""
    capsula = _nombre_capsula_agente(agente)
    paso = _siguiente_paso(agente, sesion)
    uri = f"mv2://agente/{agente}/sesion/{sesion}/{paso}"
    titulo = f"Paso {paso} · {sesion}"
    etiquetas = {"agente": agente, "sesion": sesion, "paso": str(paso)}
    ts = int(time.time())
    return poner(capsula, texto, titulo=titulo, uri=uri, etiquetas=etiquetas, ts=ts)


def buscar_recuerdos(agente: str, consulta: str, k: int = 3) -> list[Frame]:
    """Busca recuerdos del agente en su cápsula actual."""
    capsula = _nombre_capsula_agente(agente)
    return buscar(capsula, consulta, k=k)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Uso: memvid_cliente.py salud|poner|buscar|anotar ...", file=sys.stderr)
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd == "salud":
        s = salud()
        print(json.dumps({"ok": s.ok if s else False, "capsules": s.capsules if s else 0, "version": s.version if s else ""}))
    elif cmd == "poner" and len(sys.argv) >= 4:
        fid = poner(sys.argv[2], sys.argv[3])
        print(json.dumps({"frame_id": fid}))
    elif cmd == "buscar" and len(sys.argv) >= 4:
        frames = buscar(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 3)
        print(json.dumps([{"frame_id": f.frame_id, "titulo": f.title, "texto": f.text, "uri": f.uri, "ts": f.ts, "score": f.score} for f in frames]))
    elif cmd == "anotar" and len(sys.argv) >= 4:
        fid = anotar_paso(sys.argv[2], sys.argv[3], sys.argv[4])
        print(json.dumps({"frame_id": fid}))
    else:
        print("Comando inválido", file=sys.stderr)
        sys.exit(1)