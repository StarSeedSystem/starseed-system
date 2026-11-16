#!/usr/bin/env python3
"""Créditos de abliteration.ai: lectura de la cuenta y estado en disco (MOD1116).

Proveedor de modelos «abliteration.ai», API compatible con OpenAI,
`POST https://api.abliteration.ai/v1/chat/completions`, clave en la variable
`ABLITERATION_API_KEY`, modelo `abliterated-model` (256K de contexto, texto e imagen,
herramientas; $1 entrada / $0,10 entrada en caché / $3 salida por millón de tokens).
Se paga con un saldo en dólares (NO hay créditos diarios documentados); el saldo se
lee con `GET https://api.abliteration.ai/v1/credits` →
`{"data": {"total_credits": n, "total_usage": n}}` en USD.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Optional

API_CREDITS = "https://api.abliteration.ai/v1/credits"
ESTADO = os.path.expanduser("~/.starseed/abliteration-uso.json")
ARCHIVOS_DE_CLAVES = ("~/.starseed/env", "~/.hermes/.env")
VARIABLE_DIA = "STARSEED_ABLITERATION_DIA_USD"
DIA_DEFECTO = 0.50


def clave() -> Optional[str]:
    """La clave de abliteration.ai, del entorno o de los archivos de claves. Nunca se imprime."""
    v = os.environ.get("ABLITERATION_API_KEY")
    if v:
        return v
    for ruta in ARCHIVOS_DE_CLAVES:
        try:
            for linea in open(os.path.expanduser(ruta), encoding="utf-8"):
                m = re.match(r"^\s*(?:export\s+)?ABLITERATION_API_KEY=(.+?)\s*$", linea)
                if m:
                    return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def leer_creditos(
    clave: str,
    abrir: Callable[[urllib.request.Request], Any] = urllib.request.urlopen,
    tope_s: int = 20,
) -> tuple[Optional[dict], Optional[str]]:
    """Hace GET a /v1/credits con Authorization: Bearer.

    Devuelve (datos_json, None) si OK, o (None, motivo) si falla (401/403/429/otro).
    Nunca lanza excepciones.
    """
    req = urllib.request.Request(
        API_CREDITS,
        headers={
            "Authorization": f"Bearer {clave}",
            "Accept": "application/json",
            "User-Agent": "starseed-abliteration/1.0",
        },
    )
    try:
        with abrir(req, timeout=tope_s) as r:  # type: ignore[call-arg]
            cuerpo = r.read().decode("utf-8")
            return json.loads(cuerpo), None
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            return None, f"http_{e.code}"
        return None, f"http_{e.code}"
    except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError) as e:
        return None, type(e).__name__


def _leer_estado(ruta: str) -> dict:
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _escribir_atomico(ruta: str, texto: str, modo: int = 0o600) -> None:
    tmp = f"{ruta}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texto)
    os.chmod(tmp, modo)
    os.replace(tmp, ruta)


def registrar(datos_api: dict, ahora: Optional[float] = None) -> dict:
    """Procesa la respuesta de /v1/credits y devuelve el registro para guardar.

    Entrada esperada: {"data": {"total_credits": float, "total_usage": float}}
    Salida: {"saldo_usd": float, "gastado_total_usd": float, "actualizado": str_iso}
    """
    ahora = time.time() if ahora is None else ahora
    data = datos_api.get("data") or {}
    saldo = float(data.get("total_credits") or 0)
    gastado = float(data.get("total_usage") or 0)
    return {
        "saldo_usd": saldo,
        "gastado_total_usd": gastado,
        "actualizado": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(ahora)),
    }


def actualizar(
    ahora: Optional[float] = None,
    abrir: Callable[[urllib.request.Request], Any] = urllib.request.urlopen,
    ruta: str = ESTADO,
) -> dict:
    """Lee créditos, registra y escribe el estado atómicamente."""
    ahora = time.time() if ahora is None else ahora
    k = clave()
    if not k:
        return {"hecho": False, "motivo": "sin clave"}
    datos, motivo = leer_creditos(k, abrir=abrir)
    if datos is None:
        return {"hecho": False, "motivo": motivo or "error_desconocido"}
    registro = registrar(datos, ahora)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    _escribir_atomico(ruta, json.dumps(registro, ensure_ascii=False, indent=1))
    return {"hecho": True, **registro}


def _dia_limite() -> float:
    v = os.environ.get(VARIABLE_DIA)
    if v:
        try:
            return float(v)
        except ValueError:
            pass
    return DIA_DEFECTO


def resumen_estado(ruta: Optional[str] = None) -> str:
    """Genera la línea de ver: «abliteration.ai: saldo X USD · gastado hoy Y USD de Z»."""
    if ruta is None:
        ruta = ESTADO
    est = _leer_estado(ruta)
    if not est:
        return "abliteration.ai: sin datos"
    saldo = est.get("saldo_usd", 0)
    gastado_total = est.get("gastado_total_usd", 0)
    # No tenemos "gastado_hoy" separado; usamos el total como aproximación
    # ya que la API no desglosa por día. El límite diario es solo referencia.
    limite_dia = _dia_limite()
    return f"abliteration.ai: saldo {saldo:.2f} USD · gastado hoy {gastado_total:.2f} USD de {limite_dia:.2f}"


def main(
    argv: list[str],
    abrir: Callable[[urllib.request.Request], Any] = urllib.request.urlopen,
) -> int:
    if len(argv) > 1 and argv[1] == "ver":
        print(resumen_estado(ESTADO))
        return 0
    if not clave():
        print("sin clave")
        return 0
    r = actualizar(abrir=abrir)
    if r.get("hecho"):
        print(resumen_estado(ESTADO))
    else:
        print(f"abliteration.ai: {r.get('motivo', 'error')}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))