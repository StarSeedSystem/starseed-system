# -*- coding: utf-8 -*-
"""SUP1115A: la puerta de unittest del puente corre con la guardia de red puesta.

Las pruebas de fuera lanzan una puerta de verdad (`python3 -m unittest`, la orden del
orquestador y de la autopublicación) en un subproceso. La sonda de dentro solo mira y apunta
lo que ve: no pone la guardia ella misma, y si la guardia no está ni siquiera intenta
conectar (con la guardia puesta, el corte llega antes de resolver el nombre).
"""

import json
import os
import socket
import subprocess
import sys
import tempfile
import unittest
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
VAR = "STARSEED_SONDA_GUARDIA_RED"
VISTO_CON_GUARDIA = {"guardia": True, "pruebas": "1",
                     "errores": ["ErrorRedEnPruebas", "ErrorRedEnPruebas"]}


def _mirar():
    """Lo que ve una prueba cualquiera de la puerta."""
    abrir = urllib.request.urlopen
    puesta = str(getattr(abrir, "__module__", "")).endswith("guardia_pruebas")
    visto = {"guardia": puesta, "pruebas": os.environ.get("STARSEED_PRUEBAS"), "errores": []}
    if puesta:
        for intento in (lambda: abrir("https://ejemplo.invalid/sonda", timeout=2),
                        lambda: socket.create_connection(("ejemplo.invalid", 443), timeout=2)):
            try:
                intento()
                visto["errores"].append("salió")
            except Exception as error:  # noqa: BLE001
                visto["errores"].append(type(error).__name__)
    return visto


class SondaDeDentro(unittest.TestCase):
    """Corre solo dentro de la puerta que lanzan las pruebas de fuera."""

    def test_sonda(self):
        salida = os.environ.get(VAR)
        if not salida:
            self.skipTest("solo dentro de la puerta que lanzan las pruebas de fuera")
        with open(salida, "w", encoding="utf-8") as f:
            json.dump(_mirar(), f)


class TestPuertaDeUnittestConGuardia(unittest.TestCase):

    def _puerta(self, *args):
        if os.environ.get(VAR):
            self.skipTest("dentro de la sonda")
        with tempfile.TemporaryDirectory() as tmp:
            salida = os.path.join(tmp, "visto.json")
            entorno = dict(os.environ)
            entorno[VAR] = salida
            for var in ("STARSEED_PRUEBAS", "PYTEST_CURRENT_TEST"):  # la puerta arranca sin ellas
                entorno.pop(var, None)
            r = subprocess.run([sys.executable, "-m", "unittest", *args], cwd=RAIZ, env=entorno,
                               capture_output=True, text=True, timeout=180)
            self.assertTrue(os.path.exists(salida),
                            "la sonda no corrió (rc=%s): %s" % (r.returncode, r.stderr[-600:]))
            with open(salida, encoding="utf-8") as f:
                return json.load(f)

    def test_la_puerta_del_puente_pone_la_guardia_antes_de_correr_las_pruebas(self):
        # La orden del orquestador y de publicar.py, acotada a los módulos test_0_*.
        visto = self._puerta("discover", "-s", "scripts/puente", "-p", "test_0_*.py", "-q")
        self.assertEqual(visto, VISTO_CON_GUARDIA)

    def test_unittest_por_nombre_de_modulo_la_pone_al_importar_el_paquete(self):
        visto = self._puerta("scripts.puente.test_0_sonda_guardia_de_red.SondaDeDentro", "-q")
        self.assertEqual(visto, VISTO_CON_GUARDIA)

    def test_un_proceso_normal_que_importa_el_paquete_no_toca_la_red_ni_la_variable(self):
        if os.environ.get(VAR):
            self.skipTest("dentro de la sonda")
        entorno = dict(os.environ)
        for var in ("STARSEED_PRUEBAS", "PYTEST_CURRENT_TEST"):  # un proceso normal no las tiene
            entorno.pop(var, None)
        orden = ("import os, urllib.request, scripts.puente; "
                 "print(urllib.request.urlopen.__module__, os.environ.get('STARSEED_PRUEBAS'))")
        r = subprocess.run([sys.executable, "-c", orden], cwd=RAIZ, env=entorno,
                           capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr[-600:])
        self.assertEqual(r.stdout.split(), ["urllib.request", "None"])


if __name__ == "__main__":
    unittest.main()
