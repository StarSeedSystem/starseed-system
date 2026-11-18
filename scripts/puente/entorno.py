#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lector unificado de claves del entorno (SES1116C).

Acepta tanto `export NOMBRE=valor` como `NOMBRE=valor` y comillas.
Nunca imprime ni registra las claves.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any


def _leer_archivo_env(ruta: Path) -> dict[str, str]:
    """Lee el archivo de entorno y devuelve un diccionario con las claves."""
    datos = {}
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip().strip('"').strip("'")
    except OSError:
        pass
    return datos


_CACHE: dict[str, str] | None = None
_CACHE_RUTA: Path | None = None


def _cargar_cache(ruta: Path | None = None) -> dict[str, str]:
    """Carga el caché del archivo de entorno (solo una vez por ruta)."""
    global _CACHE, _CACHE_RUTA
    if ruta is None:
        ruta = Path.home() / ".starseed" / "env"
    if _CACHE is not None and _CACHE_RUTA == ruta:
        return _CACHE
    _CACHE = _leer_archivo_env(ruta)
    _CACHE_RUTA = ruta
    return _CACHE


def leer_clave(nombre: str, ruta: Path | None = None) -> str:
    """Lee una clave del entorno o de ~/.starseed/env.

    Prioridad:
    1. Variable de entorno del proceso (os.environ)
    2. Archivo ~/.starseed/env (o ruta especificada)

    Nunca imprime ni registra el valor.
    """
    # 1. Variable de entorno del proceso
    if nombre in os.environ:
        return os.environ[nombre]

    # 2. Archivo de entorno
    cache = _cargar_cache(ruta)
    return cache.get(nombre, "")


def leer_clave_obligatoria(nombre: str, ruta: Path | None = None) -> str:
    """Lee una clave obligatoria; lanza KeyError si no existe."""
    valor = leer_clave(nombre, ruta)
    if not valor:
        raise KeyError(f"Clave obligatoria no encontrada: {nombre}")
    return valor


def probar_canal_telegram(ruta: Path | None = None) -> dict[str, Any]:
    """Prueba que el canal de Telegram está configurado (sin enviar)."""
    cache = _cargar_cache(ruta)
    token = cache.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")
    chat_id = cache.get("TELEGRAM_SINTESIS_CHAT_ID", "")

    if not token or not chat_id:
        return {
            "ok": False,
            "motivo": "faltan TELEGRAM_SINTESIS_BOT_TOKEN o TELEGRAM_SINTESIS_CHAT_ID en ~/.starseed/env",
        }

    if len(token) < 10:
        return {"ok": False, "motivo": "token inválido (muy corto)"}
    if not (chat_id.startswith("-") or chat_id.isdigit()):
        return {"ok": False, "motivo": "chat_id inválido"}

    return {"ok": True, "detalle": "canal de escalado configurado correctamente"}


def enviar_telegram(mensaje: str, ruta: Path | None = None) -> dict[str, Any]:
    """Envía un mensaje por Telegram usando el bot de síntesis.

    Usa las credenciales de ~/.starseed/env.
    No imprime el token ni el chat_id.
    """
    cache = _cargar_cache(ruta)
    token = cache.get("TELEGRAM_SINTESIS_BOT_TOKEN", "")
    chat_id = cache.get("TELEGRAM_SINTESIS_CHAT_ID", "")

    if not token or not chat_id:
        return {"ok": False, "motivo": "sin credenciales de Telegram"}

    import urllib.request
    import urllib.parse

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat_id, "text": mensaje}).encode()

    try:
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=10) as resp:
            if 200 <= resp.status < 300:
                return {"ok": True, "detalle": "enviado"}
            return {"ok": False, "motivo": f"HTTP {resp.status}"}
    except Exception as e:
        return {"ok": False, "motivo": f"error enviando: {e}"}


def enviar_resolucion(servicio: str, causa: str, arreglo: str, ruta: Path | None = None) -> dict[str, Any]:
    """Envía un mensaje de resolución: '✓ resuelto (causa · arreglo)'."""
    mensaje = f"✓ {servicio} resuelto ({causa} · {arreglo})"
    return enviar_telegram(mensaje, ruta)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Uso: python3 entorno.py <clave> [--ruta <archivo>]")
        sys.exit(1)

    clave = sys.argv[1]
    ruta = None
    if "--ruta" in sys.argv:
        idx = sys.argv.index("--ruta")
        if idx + 1 < len(sys.argv):
            ruta = Path(sys.argv[idx + 1])

    try:
        valor = leer_clave_obligatoria(clave, ruta)
        print(valor)
    except KeyError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)