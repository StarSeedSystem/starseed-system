#!/usr/bin/env python3
"""Créditos de abliteration.ai para MetaGenesis (2026-11-16).

Proveedor de modelos «abliteration.ai», API compatible con OpenAI,
POST https://api.abliteration.ai/v1/chat/completions, clave en la variable
ABLITERATION_API_KEY, modelo ablitated-model (256K de contexto, texto e imagen,
herramientas; $1 entrada / $0,10 entrada en caché / $3 salida por millón de tokens).

Uso: python3 scripts/puente/abliteration.py main [argv] | ver
    python3 scripts/puente/abliteration.py ver
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

API_CREDITOS = "https://api.abliteration.ai/v1/credits"
ESTADO = os.path.expanduser("~/.starseed/abliteration-uso.json")
ARCHIVOS_DE_CLAVES = ("~/.starseed/env", "~/.hermes/.env")
LINEA_CLAVE = "ABLITERATION_API_KEY"
STARSEED_ABLITERATION_DIA_USD = float(os.environ.get("STARSEED_ABLITERATION_DIA_USD", "0.50"))


def clave():
    """La clave de la API, del entorno o de los archivos de claves. Nunca se imprime ni se guarda en el estado."""
    v = os.environ.get("ABLITERATION_API_KEY")
    if v:
        return v
    for ruta in ARCHIVOS_DE_CLAVES:
        try:
            with open(os.path.expanduser(ruta), encoding="utf-8") as f_lineas:
                for linea in f_lineas:
                    m = re.match(r"^\s*(?:export\s+)?ABLITERATION_API_KEY=(.+?)\s*$", linea)
                    if m:
                        return m.group(1).strip().strip('"').strip("'")
        except OSError:
            continue
    return None


def _pedir(k, url=API_CREDITOS, tope_s=20):
    """GET a la API con Bearer token. Devuelve JSON o levanta HTTPError/URLError."""
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + k,
        "Accept": "application/json",
        "User-Agent": "starseed-metagenesis/1.0"
    })
    with urllib.request.urlopen(req, timeout=tope_s) as r:
        return json.loads(r.read().decode("utf-8"))


def leer_creditos(k, tope_s=20):
    """Lee los créditos de abliteration.ai. Devuelve JSON o None, con motivo aparte en caso de error.
    
    Devuelve (json, None) si OK.
    Devuelve (None, "mensaje") si error (401, 403, 429, sin clave, etc.).
    """
    if not k:
        return None, "sin clave"
    try:
        datos = _pedir(k, tope_s=tope_s)
        return datos, None
    except urllib.error.HTTPError as e:
        return None, "HTTP %d" % e.code
    except (urllib.error.URLError, OSError, ValueError):
        return None, "error de red"


def registrar_uso(creditos_inicial: float, creditos_final: float, archivo=ESTADO):
    """Registra el usado del día en el archivo de estado. DEVUELTE el usado hoy."""
    ahora = time.time()
    fecha_hoy = time.strftime("%Y-%m-%d")
    
    datos_previos = {}
    try:
        with open(archivo, encoding="utf-8") as f:
            datos_previos = json.load(f)
    except (OSError, ValueError):
        pass
    
    usado_hoy = creditos_final - creditos_inicial
    datos = {
        "t": ahora,
        "fecha": fecha_hoy,
        "inicial": creditos_inicial,
        "final": creditos_final,
        "usado_hoy": usado_hoy,
        "saldo": creditos_final
    }
    
    tmp = "%s.tmp-%d" % (archivo, os.getpid())
    os.makedirs(os.path.dirname(archivo), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    os.chmod(tmp, 0o600)
    os.replace(tmp, archivo)
    
    return usado_hoy


def actualizar(ahora=None):
    """Actualiza el estado con los créditos actuales. DEVUELVE (saldo, usado_hoy, motivo)."""
    if ahora is None:
        ahora = time.time()
    k = clave()
    if not k:
        return None, None, "sin clave"
    
    datos, motivo = leer_creditos(k)
    if datos is None:
        return None, None, motivo or "error"
    
    if not isinstance(datos, dict):
        return None, None, "formato inesperado"
    
    data = datos.get("data", datos)
    saldo = data.get("total_credits") if isinstance(data, dict) else None
    usado = data.get("total_usage") if isinstance(data, dict) else None
    
    if saldo is None or usado is None:
        return None, None, "faltan total_credits o total_usage"
    
    usado_hoy = registrar_uso(saldo, usado, archivo=ESTADO)
    return saldo, usado_hoy, None


def ver():
    """Muestra el estado actual de los créditos."""
    saldo, usado_hoy, motivo = actualizar()
    if motivo:
        print("abliteration.ai: %s" % motivo)
        return
    print("abliteration.ai: saldo %.2f USD · gastado hoy %.2f USD de %.2f" % (
        saldo, usado_hoy, STARSEED_ABLITERATION_DIA_USD))


def main(argv):
    if len(argv) > 1 and argv[1] == "ver":
        ver()
        return 0
    actualizar()
    ver()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))