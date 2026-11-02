"""Lógica pura de mantener_pantalla: ajuste, herramienta, orden y estado.

No importa `subprocess`: las funciones de decisión no tocan procesos; solo
`escribir_estado` persiste el JSON con tmp + replace.
"""

import json
import os
from typing import Any, Optional

ARCHIVO_ESTADO = os.path.expanduser("~/.starseed/despierto.json")
MODOS = ("pantalla", "sistema")
RENOVAR_U_CADA_S = 50
UMBRAL_BATERIA = 15


def leer_ajuste(texto_json: str) -> bool:
    """Devuelve `activa`; True si el JSON falta, está roto o no es un objeto."""
    datos = _datos(texto_json)
    return bool(datos.get("activa", True))


def leer_modo(texto_json: str) -> str:
    """Devuelve «pantalla» o «sistema»; cualquier otro valor cae a «pantalla»."""
    modo = _datos(texto_json).get("modo")
    return modo if modo in MODOS else "pantalla"


def elegir_herramienta(
    sistema: str,
    keepalive: Optional[str],
    caffeinate: Optional[str],
    systemd_inhibit: Optional[str],
) -> Optional[str]:
    """PURA: keepalive manda; si falta, caffeinate en macOS y systemd-inhibit en Linux."""
    if keepalive:
        return keepalive
    if sistema == "Darwin" and caffeinate:
        return caffeinate
    if sistema == "Linux" and systemd_inhibit:
        return systemd_inhibit
    return None


def construir_orden(
    herramienta: str, modo: str, pid: int, umbral: int = UMBRAL_BATERIA
) -> list[str]:
    """PURA: orden exacta por herramienta y modo. No ejecuta nada."""
    nombre = os.path.basename(herramienta)
    if nombre == "keepalive":
        display = "true" if modo == "pantalla" else "false"
        return [
            herramienta,
            "--plain",
            f"--keep-display={display}",
            "--pid",
            str(pid),
            "-b",
            str(umbral),
        ]
    if nombre == "caffeinate":
        banderas = ["-dim"] if modo == "pantalla" else ["-i", "-m", "-s"]
        return [herramienta, *banderas, "-w", str(pid)]
    if nombre == "systemd-inhibit":
        return [
            herramienta,
            "--what=sleep:idle",
            "--mode=block",
            "--why=StarSeed OS mantiene la neurona despierta",
            "sleep",
            "infinity",
        ]
    return []


def que_hacer(
    activa: bool, hijo_vivo: bool, segundos_desde_ultimo_u: float, renovar: bool = True
) -> list[str]:
    """PURA: acciones del ciclo (lanzar_dim, parar_dim, declarar_usuario, nada)."""
    if not activa:
        return ["parar_dim"] if hijo_vivo else ["nada"]
    acciones = [] if hijo_vivo else ["lanzar_dim"]
    if renovar and segundos_desde_ultimo_u >= RENOVAR_U_CADA_S:
        acciones.append("declarar_usuario")
    return acciones or ["nada"]


def estado_despierto(
    modo: str, herramienta: Optional[str], pid: int, desde: int, activo: bool = True
) -> dict[str, Any]:
    """PURA: contenido de ~/.starseed/despierto.json (conserva activo/desde del panel)."""
    return {
        "activo": activo,
        "desde": desde,
        "modo": modo,
        "herramienta": herramienta,
        "pid": pid,
    }


def _datos(texto_json: str) -> dict[str, Any]:
    try:
        datos = json.loads(texto_json)
    except (ValueError, TypeError):
        return {}
    return datos if isinstance(datos, dict) else {}


def escribir_estado(datos: dict[str, Any], ruta: str = ARCHIVO_ESTADO) -> None:
    """PERSISTE: guarda con tmp + replace; si el disco falla, no tumba el servicio."""
    try:
        os.makedirs(os.path.dirname(ruta), exist_ok=True)
        with open(f"{ruta}.tmp", "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(f"{ruta}.tmp", ruta)
    except OSError:
        pass
