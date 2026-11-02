"""Lógica pura de mantener_pantalla: modo, orden por plataforma y estado.

No toca disco ni lanza procesos: se prueba sin mocks del sistema.
"""

from __future__ import annotations

import json
from typing import Any, Optional

MODOS = ("pantalla", "sistema")
UMBRAL_BATERIA = 15


def leer_modo(texto_json: str) -> Optional[str]:
    """Devuelve "pantalla", "sistema" o None (apagado).

    Compatible con el ajuste antiguo `{activa}`: ausente o roto vale "pantalla";
    `activa: false` apaga. Un `modo` desconocido también apaga.
    """
    try:
        datos: Any = json.loads(texto_json)
    except (ValueError, TypeError):
        return "pantalla"
    if not isinstance(datos, dict):
        return "pantalla"
    modo = datos.get("modo")
    if modo is not None:
        return modo if modo in MODOS else None
    return "pantalla" if bool(datos.get("activa", True)) else None


def construir_orden(
    plataforma: str,
    modo: Optional[str],
    pid: int,
    hay_keepalive: bool,
    umbral: int = UMBRAL_BATERIA,
) -> Optional[list[str]]:
    """Orden para el modo; None si está apagado o no hay herramienta válida.

    keepalive manda si está instalado: `--keep-display=true` deja la pantalla
    encendida y `false` solo mantiene el sistema. Sin keepalive: caffeinate en
    macOS y systemd-inhibit en Linux.
    """
    if modo not in MODOS:
        return None
    if hay_keepalive:
        pantalla = "true" if modo == "pantalla" else "false"
        return [
            "keepalive",
            "--plain",
            f"--keep-display={pantalla}",
            "--pid",
            str(pid),
            "-b",
            str(umbral),
        ]
    if plataforma == "darwin":
        flags = "-dim" if modo == "pantalla" else "-i"
        return ["/usr/bin/caffeinate", flags, "-w", str(pid)]
    if plataforma.startswith("linux"):
        return [
            "systemd-inhibit",
            "--what=sleep:idle",
            "--mode=block",
            "--why=StarSeed OS mantiene procesos vivos",
            "sleep",
            "infinity",
        ]
    return None


def estado_despierto(
    modo: Optional[str], orden: Optional[list[str]], pid: int
) -> dict[str, object]:
    """Estado que se escribe en `~/.starseed/despierto.json`."""
    return {
        "modo": modo,
        "herramienta": orden[0] if orden else None,
        "pid": pid,
    }
