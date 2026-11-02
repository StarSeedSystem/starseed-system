"""Mantiene despierta la pantalla o el sistema según `~/.starseed/pantalla.json`.

Modos "pantalla" y "sistema"; prefiere keepalive, cae a caffeinate en macOS y a
systemd-inhibit en Linux, y nunca usa sudo ni mata procesos ajenos.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from typing import Optional

from pantalla_logica import construir_orden, estado_despierto, leer_modo

ARCHIVO_AJUSTE = os.path.expanduser("~/.starseed/pantalla.json")
ARCHIVO_ESTADO = os.path.expanduser("~/.starseed/despierto.json")
INTERVALO_BUCLE_S = 10


def _leer_archivo_ajuste() -> str:
    try:
        with open(ARCHIVO_AJUSTE, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _escribir_estado(datos: dict[str, object]) -> None:
    try:
        os.makedirs(os.path.dirname(ARCHIVO_ESTADO), exist_ok=True)
        with open(ARCHIVO_ESTADO, "w", encoding="utf-8") as f:
            json.dump(datos, f, ensure_ascii=False)
            f.write("\n")
    except OSError:
        pass

class ServicioPantalla:
    """Lanza y vigila la orden de la plataforma; solo termina a sus hijos."""

    def __init__(self, lanzador=None, plataforma=None, hay_keepalive=None,
                 pid=None, escritor=None) -> None:
        self._popen = lanzador or subprocess.Popen
        self._plataforma = plataforma or sys.platform
        if hay_keepalive is None:
            hay_keepalive = shutil.which("keepalive") is not None
        self._hay_keepalive = hay_keepalive
        self._pid = os.getpid() if pid is None else pid
        self._escribir = escritor or _escribir_estado
        self.hijo = None
        self.modo: Optional[str] = None
        self._estado_previo: Optional[dict[str, object]] = None

    def hijo_vivo(self) -> bool:
        return self.hijo is not None and self.hijo.poll() is None

    def parar(self) -> None:
        if self.hijo is not None:
            try:
                self.hijo.terminate()
                self.hijo.wait(timeout=5)
            except Exception:
                pass
        self.hijo = None
        self.modo = None

    def ciclo(self, texto_ajuste: str) -> Optional[str]:
        modo = leer_modo(texto_ajuste)
        orden = construir_orden(self._plataforma, modo, self._pid,
                                self._hay_keepalive)
        if orden is None or self.modo != modo or not self.hijo_vivo():
            self.parar()
            if orden is not None:
                self.hijo = self._popen(
                    orden, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                self.modo = modo
        estado = estado_despierto(self.modo, orden, self._pid)
        if estado != self._estado_previo:
            self._escribir(estado)
            self._estado_previo = estado
        return self.modo


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Mantiene despierta la pantalla o el sistema."
    )
    parser.add_argument("--una-vez", action="store_true", help="Un ciclo y sale.")
    args = parser.parse_args()
    servicio = ServicioPantalla()
    modo = leer_modo(_leer_archivo_ajuste())
    orden = construir_orden(sys.platform, modo, os.getpid(),
                            shutil.which("keepalive") is not None)
    if modo is not None and orden is None:
        print("mantener_pantalla: sin keepalive, caffeinate ni systemd-inhibit; "
              "no se mantiene nada despierto.", file=sys.stderr)
    seguir = {"valor": True}

    def _terminar(_signum, _frame) -> None:
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
        servicio.ciclo('{"activa": false}')
    return 0

if __name__ == "__main__":
    sys.exit(main())
