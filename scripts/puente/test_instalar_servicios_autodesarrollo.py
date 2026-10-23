#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada periódica «autodesarrollo» de instalar-servicios.py (RTCOL1012Ld-d2).

Casos traídos de la rama archivada `nube/39935411845` (task COL1012Ld-d2), adaptados a la API de
hoy: los servicios PERIÓDICOS (StartInterval, no KeepAlive) no viven en `SERVICIOS` sino en
`PERIODICOS`, y su plist vive EN EL REPO (`scripts/puente/com.starseed.<nombre>.plist`) con las
rutas de la Mac de Alex que `adaptar_plist` reescribe al instalarse (§5 de
architecture/imaginacion-autodesarrollo.md: `com.starseed.autodesarrollo` cada 15 min).

El módulo instala al importarse, así que se carga con HOME apuntando a una carpeta temporal y
`subprocess.run` simulado: nada toca launchd, la red ni archivos reales. Con
`STARSEED_SOLO=autodesarrollo` solo debe generarse ese plist.
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
# El plist de origen vive en el repo, al lado de instalar-servicios.py.
PLIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "com.starseed.autodesarrollo.plist")


def _cargar_con_solo(carpeta, solo="autodesarrollo"):
    """Ejecuta el módulo en una HOME temporal sin tocar el sistema."""
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location(
        "instalar_servicios_autodesarrollo_en_prueba", _RUTA
    )
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    entorno = {
        "HOME": carpeta,
        "STARSEED_SOLO": solo,
        "STARSEED_RAIZ": repo_root,
        # Ruta fija, no sys.executable: bajo launchd sys.executable es el binario del framework.
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


def _args_del_plist(ruta):
    with open(ruta, "rb") as f:
        return plistlib.load(f)


class TestEntradaAutodesarrollo(unittest.TestCase):
    """El contrato de §5 (director_autodesarrollo.py ciclo, cada 15 min), en el plist del repo."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = _cargar_con_solo(self.tmp.name)

    def _origen(self):
        fuente = self.mod.PERIODICOS["autodesarrollo"]
        self.assertEqual(os.path.basename(fuente), "com.starseed.autodesarrollo.plist")
        return fuente

    def test_entrada_existe_y_ejecuta_ciclo(self):
        "El servicio periódico está dado de alta y su orden es el ciclo del director."
        fuente = self._origen()
        datos = _args_del_plist(fuente)
        orden = datos["ProgramArguments"]
        self.assertTrue(any(a.endswith("director_autodesarrollo.py") for a in orden))
        self.assertEqual(orden[-1], "ciclo")

    def test_usa_python3_con_permiso_de_disco_y_no_un_shell(self):
        "python3 absoluto (el binario con Acceso total al disco), nunca un shell."
        orden = _args_del_plist(self._origen())["ProgramArguments"]
        self.assertTrue(orden[0].endswith("python3"))
        self.assertTrue(os.path.isabs(orden[0]))
        for a in orden:
            self.assertFalse(a.endswith("zsh"))
            self.assertFalse(a.endswith("bash"))

    def test_intervalo_900_no_vive_siempre(self):
        "StartInterval cada 15 min y sin KeepAlive: es un servicio periódico, no residente."
        datos = _args_del_plist(self._origen())
        periodo = datos["StartInterval"]
        self.assertIsInstance(periodo, int)
        self.assertNotIsInstance(periodo, bool)
        self.assertEqual(periodo, 900)
        self.assertNotIn("KeepAlive", datos)

    def test_log_unico_para_salida_y_error(self):
        "La salida y el error van al mismo log (como el resto de servicios)."
        datos = _args_del_plist(self._origen())
        salida = datos["StandardOutPath"]
        self.assertEqual(salida, datos["StandardErrorPath"])
        self.assertTrue(salida)
        self.assertTrue(salida.endswith("autodesarrollo.log"))

    def test_solo_no_toca_otros_servicios(self):
        "Con STARSEED_SOLO=autodesarrollo se instala ese plist y nada más, adaptado a esta casa."
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.autodesarrollo.plist"])
        instalado = _args_del_plist(os.path.join(ag, "com.starseed.autodesarrollo.plist"))
        self.assertEqual(instalado["Label"], "com.starseed.autodesarrollo")
        self.assertIs(instalado["RunAtLoad"], True)
        self.assertNotIn("KeepAlive", instalado)
        args = instalado["ProgramArguments"]
        self.assertTrue(any(a.endswith("director_autodesarrollo.py") for a in args))
        self.assertEqual(args[-1], "ciclo")


if __name__ == "__main__":
    unittest.main()
