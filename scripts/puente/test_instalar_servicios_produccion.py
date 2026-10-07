#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada «produccion» de instalar-servicios.py (PRD1005J).

El módulo instala al importarse, así que se carga con HOME apuntando a una carpeta
temporal y `subprocess.run` simulado: nada toca launchd, la red ni archivos reales.
Con `STARSEED_SOLO=produccion` solo debe generarse ese plist.
"""

import importlib.util
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")


def _cargar_con_solo(carpeta, solo="produccion"):
    """Ejecuta el módulo en una HOME temporal sin tocar el sistema."""
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location(
        "instalar_servicios_en_prueba", _RUTA
    )
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    entorno = {"HOME": carpeta, "STARSEED_SOLO": solo}

    def falso_run(orden, **kwargs):
        m = mock.Mock()
        m.returncode, m.stdout, m.stderr = 0, "", ""
        return m

    with mock.patch.object(subprocess, "run", falso_run):
        with mock.patch.dict(os.environ, entorno):
            try:
                espec.loader.exec_module(modulo)
            except SystemExit:
                pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo


class TestEntradaProduccion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = _cargar_con_solo(self.tmp.name)

    def test_entrada_existe_comandal_y_vive_siempre(self):
        orden, log, siempre = self.mod.SERVICIOS["produccion"]
        self.assertTrue(orden[0].endswith("python3"))
        # (2026-10-07) El servicio es la autopublicación (interruptor en Genesis · Ajustes).
        self.assertTrue(orden[1].endswith("autopublicar.py"))
        self.assertEqual(orden[2:], ["--bucle"])
        self.assertEqual(log, "/tmp/starseed-produccion.log")
        self.assertIs(siempre, True)

    def test_plist_valido_con_starseed_solo(self):
        ruta = os.path.join(
            self.tmp.name, "Library", "LaunchAgents", "com.starseed.produccion.plist"
        )
        with open(ruta, "rb") as f:
            plist = plistlib.load(f)
        self.assertEqual(plist["Label"], "com.starseed.produccion")
        self.assertIs(plist["KeepAlive"], True)
        self.assertIs(plist["RunAtLoad"], True)
        args = plist["ProgramArguments"]
        self.assertTrue(any(a.endswith("autopublicar.py") for a in args))
        self.assertEqual(self.mod.SERVICIOS["produccion"][1], "/tmp/starseed-produccion.log")

    def test_solo_no_toca_otros_servicios(self):
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.produccion.plist"])


if __name__ == "__main__":
    unittest.main()
