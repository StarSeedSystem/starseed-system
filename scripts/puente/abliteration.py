#!/usr/bin/env python3
"""Créditos de abliteration.ai: estado y lectura.

Permite consultar el saldo en USD del proveedor de modelos "abliteration.ai".
Configuración: clave en `ABLITERATION_API_KEY` (entorno o archivos en ~/.starseed, ~/.hermes).

Uso: python3 scripts/puente/abliteration.py [actualizar | ver]
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Callable

ESTADO = os.path.expanduser("~/.starseed/abliteration-uso.json")
ENV_ARCHIVOS = ("~/.starseed/env", "~/.hermes/.env")
URL = "https://api.abliteration.ai/v1/credits"

try:
    from abliteration_creditos import registrar  # type: ignore
except Exception:
    def registrar(estado, saldo, ahora_iso):  # type: ignore
        return estado


def clave() -> str | None:
    """La clave, sin imprimirla; busca en entorno y archivos de claves."""
    v = os.environ.get("ABLITERATION_API_KEY")
    if v:
        return v.strip().strip('"').strip("'")
    for ruta in ENV_ARCHIVOS:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                m = re.match(r"^\s*(?:export\s+)?ABLITERATION_API_KEY=(.+?)\s*$", linea)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def leer_creditos(k: str, abrir: Callable[..., Any] = urllib.request.urlopen, tope_s: int = 20) -> tuple[dict[str, Any] | None, str | None]:
    """GET a la API. Devuelve (JSON, None) o (None, motivo)."""
    req = urllib.request.Request(URL, headers={"Authorization": "Bearer " + k, "Accept": "application/json"})
    try:
        with abrir(req, timeout=tope_s) as r:
            return json.loads(r.read().decode("utf-8")), None
    except Exception as e:
        motivo = type(e).__name__
        if isinstance(e, urllib.error.HTTPError):
            motivo = f"HTTP {e.code}"
        return None, motivo


def _escribir_atomico(ruta: str, texto: str, modo: int = 0o600):
    tmp = f"{ruta}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.chmod(tmp, modo)
    os.replace(tmp, ruta)


def actualizar(ahora: float | None = None, abrir: Callable[..., Any] = urllib.request.urlopen, ruta: str = ESTADO, clave_fn: Callable[[], str | None] = clave) -> dict[str, Any]:
    k = clave_fn()
    if not k:
        return {"hecho": False, "motivo": "sin clave"}
    data, motivo = leer_creditos(k, abrir=abrir)
    if not data:
        return {"hecho": False, "motivo": motivo or "desconocido"}

    d = data.get("data") or {}
    foto = {
        "t": ahora or time.time(),
        "total_credits": float(d.get("total_credits") or 0),
        "total_usage": float(d.get("total_usage") or 0),
    }
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    _escribir_atomico(ruta, json.dumps(foto, ensure_ascii=False, indent=1))
    foto = registrar(foto, foto.get("total_credits"), str(foto.get("t", "")))
    return {"hecho": True, **foto}


def main(argv):
    comando = argv[1] if len(argv) > 1 else "ver"
    if comando == "actualizar":
        res = actualizar()
        if not res.get("hecho"):
            print("actualizar: sin clave")
            return 0
        print("actualizado")
    elif comando == "ver":
        k = clave()
        if not k:
            print("sin clave")
            return 0
        try:
            with open(ESTADO, encoding="utf-8") as f:
                d = json.load(f)
            t_usd = d.get("total_credits", 0)
            u_usd = d.get("total_usage", 0)
            limite = os.environ.get("STARSEED_ABLITERATION_DIA_USD", "0.50")
            try:
                limite_val = float(limite)
            except ValueError:
                limite_val = 0.50
            print(f"abliteration.ai: saldo {t_usd:.2f} USD · gastado hoy {u_usd:.2f} USD de {limite_val:.2f}")
        except OSError:
            print("abliteration.ai: sin datos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))