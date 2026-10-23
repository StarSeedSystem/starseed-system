#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada «autodesarrollo» de instalar-servicios.py (IMN1021E).

El módulo instala al importarse, así que se carga con HOME apuntando a una carpeta
temporal y `subprocess.run` simulado: nada toca launchd, la red ni archivos reales.
Contrato: architecture/imaginacion-autodesarrollo.md §5 — la entrada existe, usa
python3 (con permiso de disco) y no un shell, y corre cada 900 s.
"""

import importlib.util
import os
import plistlib
import subprocess
import tempfile
import unittest
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")


def _cargar_con_solo(carpeta, solo="autodesarrollo"):
    """Ejecuta el módulo en una HOME temporal sin tocar el sistema."""
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_servicios_autodesarrollo", _RUTA)
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    raiz_repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    entorno = {
        "HOME": carpeta,
        "STARSEED_SOLO": solo,
        "STARSEED_RAIZ": raiz_repo,
        "STARSEED_PY3": "/opt/homebrew/bin/python3",
    }

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


class TestEntradaAutodesarrollo(unittest.TestCase):
    """La entrada existe, usa python3 y no un shell, e intervalo 900."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = _cargar_con_solo(self.tmp.name)

    def _orden(self):
        return self.mod.SERVICIOS["autodesarrollo"][0]

    def test_entrada_existe_y_ejecuta_ciclo(self):
        orden, log, periodo = self.mod.SERVICIOS["autodesarrollo"]
        self.assertTrue(any(a.endswith("director_autodesarrollo.py") for a in orden))
        self.assertEqual(orden[-1], "ciclo")
        self.assertEqual(log, "/tmp/starseed-autodesarrollo.log")
        self.assertEqual(periodo, 900)

    def test_usa_python3_con_permiso_de_disco_y_no_un_shell(self):
        orden = self._orden()
        self.assertEqual(orden[0], self.mod.PY3)
        self.assertTrue(orden[0].endswith("python3"))
        self.assertTrue(os.path.isabs(orden[0]))
        for a in orden:
            self.assertFalse(a.endswith("zsh"))
            self.assertFalse(a.endswith("bash"))

    def test_intervalo_900_no_vive_siempre(self):
        periodo = self.mod.SERVICIOS["autodesarrollo"][2]
        self.assertIsInstance(periodo, int)
        self.assertNotIsInstance(periodo, bool)
        self.assertEqual(periodo, 900)

    def test_plist_valido_con_starseed_solo(self):
        ruta = os.path.join(
            self.tmp.name, "Library", "LaunchAgents", "com.starseed.autodesarrollo.plist"
        )
        with open(ruta, "rb") as fichero:
            plist = plistlib.load(fichero)
        self.assertEqual(plist["Label"], "com.starseed.autodesarrollo")
        self.assertEqual(plist["StartInterval"], 900)
        self.assertNotIn("KeepAlive", plist)
        self.assertIs(plist["RunAtLoad"], True)
        args = plist["ProgramArguments"]
        self.assertTrue(args[0].endswith("python3") and os.path.isabs(args[0]))
        self.assertTrue(any(a.endswith("director_autodesarrollo.py") for a in args))
        self.assertEqual(plist["StandardOutPath"], "/tmp/starseed-autodesarrollo.log")
        self.assertEqual(plist["StandardErrorPath"], "/tmp/starseed-autodesarrollo.log")

    def test_solo_no_toca_otros_servicios(self):
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.autodesarrollo.plist"])


if __name__ == "__main__":
    unittest.main()
