#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del servicio «autodesarrollo» de instalar-servicios.py (Ola 1024I · IMG1024E; era IMN1021Eb).

El módulo instala al importarse, así que se carga con HOME en una carpeta temporal y `subprocess.run`
simulado: ni launchctl ni plutil de verdad (aquí no hay launchd). Vigila lo que costó caro en los demás
servicios: python3 por ruta absoluta, lanzador-tcc.py de padre, cada 15 min sin KeepAlive y un ProcessType
que no ahogue lo que el director lanza.
"""

import importlib.util
import os
import plistlib
import subprocess
import tempfile
import unittest
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(AQUI, "instalar-servicios.py")
RAIZ = os.path.dirname(os.path.dirname(AQUI))
PY3 = "/opt/homebrew/bin/python3"


def cargar(casa, solo="autodesarrollo"):
    """Ejecuta el módulo en una HOME temporal; devuelve (módulo, órdenes que habría lanzado)."""
    os.makedirs(os.path.join(casa, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_servicios_autodesarrollo", RUTA)
    modulo = importlib.util.module_from_spec(espec)
    ordenes = []

    def falso_run(orden, **kwargs):
        ordenes.append(list(orden))
        m = mock.Mock()
        m.returncode, m.stdout, m.stderr = 0, "", ""
        return m

    entorno = {"HOME": casa, "STARSEED_SOLO": solo, "STARSEED_RAIZ": RAIZ, "STARSEED_PY3": PY3}
    with mock.patch.object(subprocess, "run", falso_run), mock.patch.dict(os.environ, entorno):
        try:
            espec.loader.exec_module(modulo)
        except SystemExit:
            pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo, ordenes


class ServicioAutodesarrollo(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod, self.ordenes = cargar(self.tmp.name)
        self.ruta = os.path.join(self.tmp.name, "Library", "LaunchAgents", "com.starseed.autodesarrollo.plist")
        with open(self.ruta, "rb") as f:
            self.plist = plistlib.load(f)  # si no es un plist válido, esto falla (lo que miraría plutil -lint)

    def test_cada_15_minutos_sin_keepalive(self):
        p = self.plist
        self.assertEqual(p["Label"], "com.starseed.autodesarrollo")
        self.assertEqual(p["StartInterval"], 900)
        self.assertIs(p["RunAtLoad"], True)
        self.assertNotIn("KeepAlive", p)
        self.assertEqual(p["ProcessType"], "Standard")      # nunca Background: lo lanzado lo heredaría
        self.assertIs(p["AbandonProcessGroup"], True)
        self.assertEqual(p["WorkingDirectory"], RAIZ)
        self.assertEqual(p["EnvironmentVariables"]["STARSEED_ROOT"], RAIZ)
        self.assertEqual(p["StandardOutPath"], "/tmp/starseed-autodesarrollo.log")
        self.assertEqual(p["StandardErrorPath"], "/tmp/starseed-autodesarrollo.log")  # los errores al mismo log

    def test_lanzador_tcc_de_padre_y_rutas_absolutas(self):
        args = self.plist["ProgramArguments"]
        self.assertEqual(args[0], PY3)                        # launchd no usa el PATH
        self.assertTrue(args[1].endswith("scripts/puente/lanzador-tcc.py") and os.path.isfile(args[1]))
        resto = args[args.index("--") + 1:]
        self.assertEqual(resto[0], PY3)
        self.assertEqual(resto[1], "-u")
        self.assertTrue(resto[2].endswith("scripts/puente/director_autodesarrollo.py") and os.path.isfile(resto[2]))
        self.assertEqual(resto[3:], ["ciclo"])
        self.assertTrue(all(os.path.isabs(a) for a in (args[0], args[1], resto[0], resto[2])))
        self.assertTrue(args[0].endswith("python3"))           # el binario con permiso de disco
        for a in args:
            self.assertFalse(a.endswith("zsh") or a.endswith("bash"))  # nunca un shell

    def test_no_se_instala_dos_veces(self):
        # La rama de la nube metía «autodesarrollo» también en SERVICIOS; con la
        # entrada de CADA serían dos instalaciones del mismo label. Solo una.
        self.assertNotIn("autodesarrollo", self.mod.SERVICIOS)
        self.assertIn("autodesarrollo", self.mod.CADA)
        orden, log, cada_s, _tipo = self.mod.CADA["autodesarrollo"]
        self.assertEqual(cada_s, 900)
        self.assertEqual(log, "/tmp/starseed-autodesarrollo.log")
        self.assertEqual(orden[-1], "ciclo")

    def test_carga_por_launchctl_simulado_y_solo_ese(self):
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.autodesarrollo.plist"])
        self.assertIn(["plutil", "-lint", self.ruta], self.ordenes)
        self.assertEqual([o for o in self.ordenes if o[0] == "launchctl"],
                         [["launchctl", "unload", self.ruta], ["launchctl", "load", self.ruta]])

    def test_el_director_entiende_la_orden(self):
        with open(os.path.join(AQUI, "director_autodesarrollo.py"), encoding="utf-8") as f:
            fuente = f.read()
        self.assertIn('choices=["ciclo"]', fuente)


class InstalacionCompleta(unittest.TestCase):
    def test_sin_solo_tambien_lo_instala(self):
        with tempfile.TemporaryDirectory() as casa:
            _, ordenes = cargar(casa, solo="")
            ag = os.path.join(casa, "Library", "LaunchAgents")
            self.assertIn("com.starseed.autodesarrollo.plist", os.listdir(ag))
            self.assertIn("com.starseed.produccion.plist", os.listdir(ag))   # los demás, como siempre
            self.assertTrue(all(o[0] in ("plutil", "launchctl") for o in ordenes))


if __name__ == "__main__":
    unittest.main()
