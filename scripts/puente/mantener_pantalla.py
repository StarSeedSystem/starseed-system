"""Servicio que mantiene la pantalla de la Mac encendida según el ajuste global.

Lee `~/.starseed/pantalla.json` ({activa, desde, quien}); si no existe o está
roto, vale activa=True (encendido por defecto). Con activa=True mantiene un
`caffeinate -dim` vivo (ligado a este proceso con `-w`, así muere si morimos)
y cada 50 s lanza `caffeinate -u -t 60` para declarar al usuario activo y
evitar el salvapantallas y el apagado por inactividad. Con activa=False o al
recibir SIGTERM/SIGINT, termina SOLO sus hijos (nunca `pkill caffeinate`).
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from typing import Any, Optional

CAFFEINATE = "/usr/bin/caffeinate"
ARCHIVO_AJUSTE = os.path.expanduser("~/.starseed/pantalla.json")
INTERVALO_BUCLE_S = 10
RENOVAR_U_CADA_S = 50
U_TIEMPO_S = 60


def leer_ajuste(texto_json: str) -> bool:
    """Devuelve `activa` del JSON; True si está vacío o roto."""
    try:
        datos: Any = json.loads(texto_json)
    except (ValueError, TypeError):
        return True
    if isinstance(datos, dict):
        return bool(datos.get("activa", True))
    return True


def que_hacer(
    activa: bool, hijo_vivo: bool, segundos_desde_ultimo_u: float
) -> list[str]:
    """Decide las acciones del ciclo: lanzar_dim, parar_dim, declarar_usuario, nada."""
    acciones: list[str] = []
    if activa:
        if not hijo_vivo:
            acciones.append("lanzar_dim")
        if segundos_desde_ultimo_u >= RENOVAR_U_CADA_S:
            acciones.append("declarar_usuario")
        if not acciones:
            acciones.append("nada")
    else:
        if hijo_vivo:
            acciones.append("parar_dim")
        else:
            acciones.append("nada")
    return acciones


class ServicioPantalla:
    """Mantiene vivos los `caffeinate` propios mientras el ajuste diga activa."""

    def __init__(self, lanzador_popen=None, lanzador_run=None, ahora=None) -> None:
        self._popen = lanzador_popen or subprocess.Popen
        self._run = lanzador_run or subprocess.run
        self._ahora = ahora or time.monotonic
        self.hijo: Optional[subprocess.Popen] = None
        self._ultimo_u: float = 0.0

    def hijo_vivo(self) -> bool:
        return self.hijo is not None and self.hijo.poll() is None

    def lanzar_dim(self) -> None:
        self.parar_dim()
        self.hijo = self._popen(
            [CAFFEINATE, "-dim", "-w", str(os.getpid())],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def parar_dim(self) -> None:
        if self.hijo is not None:
            try:
                self.hijo.terminate()
                self.hijo.wait(timeout=5)
            except Exception:
                pass
            self.hijo = None

    def declarar_usuario(self) -> None:
        try:
            self._run([CAFFEINATE, "-u", "-t", str(U_TIEMPO_S)], timeout=10)
        except Exception:
            pass
        self._ultimo_u = self._ahora()

    def ciclo(self, texto_ajuste: str) -> list[str]:
        acciones = que_hacer(
            leer_ajuste(texto_ajuste), self.hijo_vivo(), self._ahora() - self._ultimo_u
        )
        for accion in acciones:
            if accion == "lanzar_dim":
                self.lanzar_dim()
            elif accion == "parar_dim":
                self.parar_dim()
            elif accion == "declarar_usuario":
                self.declarar_usuario()
        return acciones


def _leer_archivo_ajuste() -> str:
    try:
        with open(ARCHIVO_AJUSTE, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Mantiene la pantalla encendida.")
    parser.add_argument("--una-vez", action="store_true", help="Un ciclo y sale.")
    args = parser.parse_args()

    if not os.path.exists(CAFFEINATE):
        print("mantener_pantalla: no hay /usr/bin/caffeinate (no es macOS); en espera.")
        return 0

    servicio = ServicioPantalla()
    seguir = {"valor": True}

    def _terminar(signum, _frame) -> None:
        seguir["valor"] = False

    signal.signal(signal.SIGTERM, _terminar)
    signal.signal(signal.SIGINT, _terminar)

    try:
        while seguir["valor"]:
            servicio.ciclo(_leer_archivo_ajuste())
            if args.una_vez:
                break
            time.sleep(INTERVALO_BUCLE_S)
    finally:
        servicio.parar_dim()
    return 0


if __name__ == "__main__":
    sys.exit(main())
