#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Mantiene la pantalla de la Mac encendida según el ajuste del Mando.

Lee ``~/.starseed/pantalla.json`` (``{activa, desde, quien}``; si falta o está
roto, vale activa). Con el ajuste activo mantiene vivo un ``caffeinate -dim``
y, cada 50 s, lanza ``caffeinate -u -t 60``: la aserción de usuario activo es
la que impide el salvapantallas y el apagado por inactividad. Con el ajuste
inactivo termina su propio ``caffeinate`` por PID (jamás matando por nombre,
porque eso mataría también el de ``com.starseed.despierto``). En Linux no existe
``/usr/bin/caffeinate``: avisa una vez y espera sin hacer nada.

Uso: ``mantener_pantalla.py [--una-vez]``
"""

import argparse
import json
import os
import signal
import subprocess
import sys
import time

#: Ruta del ajuste global compartido con la ruta /api/mando/pantalla.
AJUSTE = os.path.expanduser(os.path.join("~", ".starseed", "pantalla.json"))

#: Binario de macOS que mantiene aserciones de energía; no existe en Linux.
CAFFEINATE = "/usr/bin/caffeinate"

#: El bucle principal vuelve a mirar el ajuste cada tantos segundos.
INTERVALO_BUCLE = 10

#: Cada tantos segundos se declara usuario activo con ``caffeinate -u -t 60``.
INTERVALO_USUARIO = 50


def leer_ajuste(texto_json):
    """Devuelve True salvo que el JSON diga claramente ``activa: false``.

    Encendido por defecto: archivo vacío, JSON roto o sin la clave → True.
    """
    try:
        datos = json.loads(texto_json)
    except (TypeError, ValueError):
        return True
    if not isinstance(datos, dict):
        return True
    return bool(datos.get("activa", True))


def que_hacer(activa, hijo_vivo, segundos_desde_ultimo_u):
    """Decide las acciones del turno, en orden.

    «lanzar_dim», «parar_dim», «declarar_usuario» o «nada».
    """
    if not activa:
        return ["parar_dim"] if hijo_vivo else ["nada"]
    acciones = []
    if not hijo_vivo:
        acciones.append("lanzar_dim")
    if segundos_desde_ultimo_u >= INTERVALO_USUARIO:
        acciones.append("declarar_usuario")
    return acciones or ["nada"]


class Servicio:
    """Bucle con estado: el PID del ``caffeinate -dim`` que él mismo lanzó."""

    def __init__(self, ajuste=AJUSTE):
        self.ajuste = ajuste
        self.hijo = None
        # El arranque ya vale como primer «usuario activo»: así el primer
        # turno solo lanza el -dim y el -u -t 60 llega a los 50 s.
        self.ultimo_u = time.time()
        self.seguir = True
        self._avisado_sin_caffeinate = False

    def _leer_activa(self):
        try:
            with open(self.ajuste, "r", encoding="utf-8") as f:
                return leer_ajuste(f.read())
        except OSError:
            return True

    def _parar_hijo(self):
        if self.hijo is None:
            return
        try:
            self.hijo.terminate()
        except OSError:
            pass
        self.hijo = None

    def limpiar(self, *_args):
        """SIGTERM/SIGINT: termina el hijo antes de salir."""
        self.seguir = False
        self._parar_hijo()

    def turno(self):
        if not os.path.exists(CAFFEINATE):
            if not self._avisado_sin_caffeinate:
                print("mantener_pantalla: no existe %s; nada que hacer aquí."
                      % CAFFEINATE)
                self._avisado_sin_caffeinate = True
            return
        activa = self._leer_activa()
        hijo_vivo = self.hijo is not None and self.hijo.poll() is None
        if not hijo_vivo:
            self.hijo = None
        for accion in que_hacer(activa, hijo_vivo, time.time() - self.ultimo_u):
            if accion == "lanzar_dim":
                self.hijo = subprocess.Popen([CAFFEINATE, "-dim"])
            elif accion == "parar_dim":
                self._parar_hijo()
            elif accion == "declarar_usuario":
                subprocess.run([CAFFEINATE, "-u", "-t", "60"], check=False)
                self.ultimo_u = time.time()

    def run(self, una_vez=False):
        signal.signal(signal.SIGTERM, self.limpiar)
        signal.signal(signal.SIGINT, self.limpiar)
        while self.seguir:
            self.turno()
            if una_vez:
                break
            time.sleep(INTERVALO_BUCLE)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Mantiene la pantalla encendida según %s" % AJUSTE)
    parser.add_argument("--una-vez", action="store_true",
                        help="ejecuta un solo turno y sale (pruebas manuales)")
    args = parser.parse_args(argv)
    Servicio().run(una_vez=args.una_vez)
    return 0


if __name__ == "__main__":
    sys.exit(main())
