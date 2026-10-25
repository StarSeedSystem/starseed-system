#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del servicio «chatterbox» de instalar-servicios.py (SGO1024E).

instalar-servicios.py instala AL IMPORTARSE: se carga con HOME en una carpeta temporal
y `subprocess.run` simulado — sin launchctl, sin plutil y sin paquete chatterbox real.
Con STARSEED_SOLO=chatterbox sólo se toca ese servicio, y en la decisión de instalar
se inyecta a instalar_chatterbox el veredicto para probar las dos ramas.
"""

import importlib.util
import os
import plistlib
import subprocess
import tempfile
import unittest
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_PLANTILLA = os.path.join(_REPO, "native", "astraura-voice", "chatterbox",
                          "com.starseed.chatterbox.plist")


def _falso_run(salida=""):
    m = mock.Mock()
    m.returncode, m.stdout, m.stderr = 0, salida, ""
    return m


def _cargar_con_solo(carpeta):
    """Ejecuta el módulo en una HOME temporal sin tocar nada del sistema.

    La comprobación del paquete corre como subproceso con el intérprete del servicio:
    el `run` falso devuelve salida vacía → «no está instalado» → ni un plist por ahí.
    """
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_servicios_chatterbox_prueba", _RUTA)
    modulo = importlib.util.module_from_spec(espec)
    entorno = {
        "HOME": carpeta,
        "STARSEED_SOLO": "chatterbox",
        "STARSEED_RAIZ": _REPO,
        "STARSEED_PY3": "/opt/homebrew/bin/python3",
    }
    with mock.patch.object(subprocess, "run", lambda orden, **k: _falso_run()):
        with mock.patch.dict(os.environ, entorno):
            try:
                espec.loader.exec_module(modulo)
            except SystemExit:
                pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo


class PlantillaDelPlist(unittest.TestCase):
    """La plantilla versionada es la misma pauta que los demás servicios de voz."""

    def test_patron_de_voz(self):
        with open(_PLANTILLA, "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.chatterbox")
        self.assertIs(p["RunAtLoad"], True)
        self.assertIs(p["KeepAlive"], True)  # el plist sólo existe si el paquete está
        self.assertEqual(p["ProcessType"], "Interactive")  # Ola 255: Background estrangula
        self.assertIs(p["LowPriorityIO"], False)
        args = p["ProgramArguments"]
        self.assertTrue(args[0].endswith("lanzador-tcc.py"))  # padre de TCC
        self.assertEqual(args[1], "--")
        self.assertEqual(args[2], "__INTERPRETE__")  # ruta absoluta la pone el instalador
        self.assertIn("-u", args)  # sin -u el log queda a 0 bytes
        self.assertTrue(args[-1].endswith(os.path.join("native", "astraura-voice",
                                                       "chatterbox", "servidor.py")))
        self.assertIn("PATH", p["EnvironmentVariables"])


class DecisionDeInstalar(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.mod = _cargar_con_solo(self.tmp.name)

    def test_sin_paquete_no_instala_y_lo_dice(self):
        # La decisión del import ya pasó: sin paquete, ni un plist en LaunchAgents.
        self.assertEqual(os.listdir(self.ag), [])
        motivo = self.mod.instalar_chatterbox(False)
        self.assertIn("chatterbox-tts no está instalado", motivo)
        self.assertIn("pip install chatterbox-tts", motivo)
        self.assertEqual(os.listdir(self.ag), [])

    def test_con_paquete_instala_plist_adaptado(self):
        with mock.patch.object(subprocess, "run", lambda orden, **k: _falso_run()):
            self.assertEqual(self.mod.instalar_chatterbox(True), "")
        ruta = os.path.join(self.ag, "com.starseed.chatterbox.plist")
        self.assertTrue(os.path.exists(ruta))
        with open(ruta, "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.chatterbox")
        self.assertIs(p["KeepAlive"], True)
        self.assertEqual(p["ProcessType"], "Interactive")
        args = p["ProgramArguments"]
        # Lanzador de TCC como padre e intérprete ABSOLUTO (launchd no usa el PATH).
        self.assertTrue(args[0].endswith("lanzador-tcc.py"))
        self.assertEqual(args[2], "/opt/homebrew/bin/python3")
        self.assertNotIn("__INTERPRETE__", "\n".join(args))
        self.assertTrue(args[-1].endswith(os.path.join("native", "astraura-voice",
                                                       "chatterbox", "servidor.py")))
        # Adaptado a esta instalación, no a las rutas de la Mac de Alex.
        self.assertEqual(p["WorkingDirectory"], _REPO)
        self.assertEqual(p["StandardOutPath"],
                         os.path.join(self.tmp.name, ".starseed", "chatterbox.log"))

    def test_intentos_de_instalacion_sin_launchctl(self):
        falso = mock.MagicMock()
        falso.side_effect = lambda orden, **k: _falso_run()
        with mock.patch.object(subprocess, "run", falso):
            self.mod.instalar_chatterbox(True)
        ordenes = [c.args[0] for c in falso.call_args_list]
        self.assertTrue(any(o[0] == "plutil" for o in ordenes))
        self.assertTrue(any(o[0] == "launchctl" for o in ordenes))


class VeredictoDeChatterboxEsta(unittest.TestCase):
    """El paquete lo comprueba el INTÉRPRETE del servicio, no el python del guion."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = _cargar_con_solo(self.tmp.name)

    def test_la_salida_del_interprete_manda(self):
        capturas = []

        def falso_run(orden, **kwargs):
            capturas.append(orden)
            return _falso_run(salida)

        # El padre es el intérprete dado (-c con el servidor como argumento) y su
        # veredicto impreso es lo que vale: «True» instala, lo demás no.
        for salida, esperado in (("True\n", True), ("False\n", False), ("", False)):
            del capturas[:]
            with mock.patch.object(subprocess, "run", falso_run):
                self.assertIs(self.mod.chatterbox_esta("/x/py3"), esperado)
            self.assertEqual(capturas[-1][0], "/x/py3")
            self.assertIn("-c", capturas[-1])
            self.assertTrue(capturas[-1][-1].endswith(
                os.path.join("native", "astraura-voice", "chatterbox", "servidor.py")))

    def test_si_el_interprete_no_existe_no_esta(self):
        def roto(orden, **kwargs):
            raise FileNotFoundError("/x/py3 no existe")

        with mock.patch.object(subprocess, "run", roto):
            self.assertIs(self.mod.chatterbox_esta("/x/py3"), False)


if __name__ == "__main__":
    unittest.main()
