#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cerrojo para uso AUTOMÁTICO de `claude` (CLA1126A).

Garantiza que solo un `claude` automático corra a la vez usando flock.
El cerrojo vive en ~/.starseed/cerrojos/claude-auto.lock.

Funciones puras (sin I/O) para probar sin sistema de archivos real.
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Optional

CERROJO_DIR = Path.home() / ".starseed" / "cerrojos"
CERROJO_RUTA = CERROJO_DIR / "claude-auto.lock"
# Tiempo máximo que esperamos el cerrojo (segundos). Si se supera, lanzamos error.
ESPERA_MAXIMA_S = 300
# Intervalo de sondeo mientras esperamos (segundos).
ESPERA_SONDEO_S = 0.5


def _asegurar_directorio(ruta: Path = CERROJO_DIR) -> None:
    """Crea el directorio del cerrojo si no existe."""
    try:
        ruta.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def _abrir_cerrojo(ruta: Path = CERROJO_RUTA):
    """Abre (o crea) el archivo del cerrojo en modo append."""
    _asegurar_directorio(ruta.parent)
    return open(ruta, "a")


@contextmanager
def cerrojo_claude_auto(
    ruta: Path = CERROJO_RUTA,
    espera_maxima: float = ESPERA_MAXIMA_S,
    sondeo: float = ESPERA_SONDEO_S,
    time_fn: Callable[[], float] = time.time,
    flock_fn: Callable = None,
):
    """Context manager que adquiere el cerrojo exclusivo (flock) para `claude` automático.

    Uso:
        with cerrojo_claude_auto():
            # solo un hilo/proceso a la vez puede estar aquí
            rc, salida = correr(["claude", ...])

    Args:
        ruta: Ruta al archivo de cerrojo.
        espera_maxima: Segundos máximos a esperar el cerrojo.
        sondeo: Segundos entre intentos.
        time_fn: Función para obtener tiempo (inyectable para tests).
        flock_fn: Función flock (inyectable para tests; default: fcntl.flock).

    Yields:
        True si se adquirió el cerrojo.

    Raises:
        TimeoutError: Si no se pudo adquirir el cerrojo en espera_maxima.
        OSError: Error de sistema de archivos.
    """
    import fcntl

    flock_fn = flock_fn or fcntl.flock
    fd = _abrir_cerrojo(ruta)
    inicio = time_fn()
    try:
        while True:
            try:
                flock_fn(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time_fn() - inicio >= espera_maxima:
                    raise TimeoutError(
                        f"No se pudo adquirir el cerrojo de claude automático en {espera_maxima:.0f}s"
                    )
                time.sleep(sondeo)
        yield True
    finally:
        try:
            flock_fn(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        fd.close()


def esta_ocupado(ruta: Path = CERROJO_RUTA, flock_fn: Callable = None) -> bool:
    """Comprueba si el cerrojo está ocupado AHORA (sin bloquear).

    Útil para que el medidor decida NO ejecutarse si otro claude automático corre.

    Returns:
        True si hay otro proceso sosteniendo el cerrojo.
    """
    import fcntl

    flock_fn = flock_fn or fcntl.flock
    if not ruta.exists():
        return False
    try:
        fd = open(ruta, "a")
        try:
            flock_fn(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            flock_fn(fd, fcntl.LOCK_UN)
            fd.close()
            return False
        except BlockingIOError:
            fd.close()
            return True
    except OSError:
        return False


def leer_entorno_claude_token(ruta_env: Path = None) -> Optional[str]:
    """Lee CLAUDE_CODE_OAUTH_TOKEN desde ~/.starseed/env o variable de entorno.

    Prioridad:
    1. Variable de entorno del proceso (os.environ)
    2. Archivo ~/.starseed/env (o ruta especificada)

    Nunca imprime ni registra el valor.
    """
    # 1. Variable de entorno del proceso
    if "CLAUDE_CODE_OAUTH_TOKEN" in os.environ:
        return os.environ["CLAUDE_CODE_OAUTH_TOKEN"]

    # 2. Archivo de entorno
    ruta = ruta_env or (Path.home() / ".starseed" / "env")
    try:
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                if linea.startswith("export "):
                    linea = linea[7:]
                k, v = linea.split("=", 1)
                if k.strip() == "CLAUDE_CODE_OAUTH_TOKEN":
                    valor = v.strip().strip('"').strip("'")
                    return valor if valor else None
    except OSError:
        pass
    return None


def preparar_env_claude(env: dict, ruta_env: Path = None) -> dict:
    """Prepara el entorno para `claude` automático.

    - Quita ANTHROPIC_API_KEY y ANTHROPIC_AUTH_TOKEN (para que use la sesión de claude.ai)
    - Añade CLAUDE_CODE_OAUTH_TOKEN si existe en ~/.starseed/env
    """
    from motores_director import entorno_sin_claves_api

    limpio = entorno_sin_claves_api(dict(env))
    token = leer_entorno_claude_token(ruta_env)
    if token:
        limpio["CLAUDE_CODE_OAUTH_TOKEN"] = token
    return limpio


def detectar_no_logueado(salida: str) -> bool:
    """Detecta si la salida de `claude` indica 'Not logged in'."""
    if not salida:
        return False
    bajo = salida.lower()
    return "not logged in" in bajo or "please run /login" in bajo


def avisar_no_logueado(
    canal_decir: Callable[[str, str, str, Optional[str]], None],
    tarea_id: Optional[str] = None,
) -> None:
    """Envía un único aviso al canal Principal (vía Telegram) diciendo qué hacer.

    No reintenta en bucle: solo avisa una vez.
    """
    mensaje = (
        "⚠️ Claude Code en la Mac dice «Not logged in · Please run /login».\n"
        "Acción requerida: Maggasukha debe ejecutar `claude auth login` o `claude setup-token` "
        "en la Terminal de la Mac. El token de larga duración (CLAUDE_CODE_OAUTH_TOKEN) "
        "se guarda en ~/.starseed/env y lo usan TODOS los usos automáticos de `claude`."
    )
    canal_decir(mensaje, "claude-cerrojo", "aviso", tarea_id)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "test-lock":
        print("Probando cerrojo...")
        with cerrojo_claude_auto():
            print("Cerrojo adquirido. Esperando 2s...")
            time.sleep(2)
        print("Cerrojo liberado.")
    elif len(sys.argv) > 1 and sys.argv[1] == "check-env":
        token = leer_entorno_claude_token()
        if token:
            print(f"CLAUDE_CODE_OAUTH_TOKEN encontrado (longitud: {len(token)})")
        else:
            print("CLAUDE_CODE_OAUTH_TOKEN NO encontrado en ~/.starseed/env ni en entorno")
    else:
        print("Uso: python3 claude_cerrojo.py [test-lock|check-env]")