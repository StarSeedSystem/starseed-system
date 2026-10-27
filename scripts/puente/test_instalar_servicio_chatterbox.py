#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada «chatterbox» de instalar-servicios.py (SGO1024E).

El módulo instala al importarse: se carga en proceso con HOME temporal, `STARSEED_SOLO=chatterbox`
y `subprocess.run` sustituido — nada toca launchd, plutil ni la red. La decisión de instalar es la
real (`find_spec('chatterbox')` en un hijo de veras): con un paquete falso en PYTHONPATH se genera
el plist; sin paquete (sonda forzada a fallar) se omite el servicio y lo dice.
"""
import importlib.util
import io
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")
_EJECUTAR_REAL = subprocess.run
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _cargar(carpeta, paquete_falso=None, sonda=None, chatterbox_py=None):
    """Carga el módulo con SOLO=chatterbox. Devuelve (módulo, lo que imprimió)."""
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_chatterbox_en_prueba", _RUTA)
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    pythonpath = ""
    if paquete_falso:
        paquete = os.path.join(carpeta, "paquete_falso", "chatterbox")
        os.makedirs(paquete)
        with open(os.path.join(paquete, "__init__.py"), "w", encoding="utf-8") as f:
            f.write("")
        pythonpath = os.path.join(carpeta, "paquete_falso")
    entorno = {
        "HOME": carpeta,
        "STARSEED_SOLO": "chatterbox",
        "STARSEED_RAIZ": _REPO,
        "STARSEED_PY3": sys.executable,
        "STARSEED_CHATTERBOX_PY": chatterbox_py or sys.executable,
        "PYTHONPATH": pythonpath,
    }

    def falso_run(orden, **kwargs):
        guion = isinstance(orden, list) and len(orden) >= 2 and orden[:2] == [sys.executable, "-c"]
        if guion and sonda is None:  # la decisión de instalar corre DE VERDAD
            return _EJECUTAR_REAL(orden, capture_output=True)
        resultado = mock.Mock()
        resultado.returncode = 1 if (guion and sonda == "sin_paq") else 0
        resultado.stdout = ""
        resultado.stderr = ""
        return resultado

    salida = io.StringIO()
    with mock.patch.object(subprocess, "run", falso_run):
        with mock.patch.dict(os.environ, entorno):
            with redirect_stdout(salida):
                try:
                    espec.loader.exec_module(modulo)
                except SystemExit:
                    pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo, salida.getvalue()


class TestServicioChatterbox(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _ruta_plist(self, carpeta):
        return os.path.join(carpeta, "Library", "LaunchAgents", "com.starseed.chatterbox.plist")

    def test_paquete_instalado_genera_plist_valido(self):
        modulo, salida = _cargar(self.tmp.name, paquete_falso=True)
        ruta = self._ruta_plist(self.tmp.name)
        self.assertTrue(os.path.exists(ruta))
        self.assertIn("cargado", salida)
        self.assertIn(sys.executable, salida)
        with open(ruta, "rb") as f:
            plist = plistlib.load(f)
        self.assertEqual(plist["Label"], "com.starseed.chatterbox")
        self.assertIs(plist["RunAtLoad"], True)
        # (SGO1024E) KeepAlive sólo porque el paquete está: el servicio ve siempre un motor.
        self.assertIs(plist["KeepAlive"], True)
        self.assertEqual(plist["ProcessType"], "Interactive")
        self.assertIs(plist["LowPriorityIO"], False)
        args = plist["ProgramArguments"]
        self.assertTrue(any(a.endswith("lanzador-tcc.py") for a in args))
        self.assertIn("--", args)
        self.assertIn(sys.executable, args)
        self.assertTrue(any(a.endswith("servidor.py") for a in args))
        env = plist["EnvironmentVariables"]
        self.assertEqual(env["HF_HUB_OFFLINE"], "1")  # nunca descarga pesos
        self.assertEqual(env["CHATTERBOX_PORT"], "4505")
        self.assertTrue(env["PATH"].startswith(modulo.HOME + "/"))

    def test_sin_paquete_no_instala_y_lo_dice(self):
        _modulo, salida = _cargar(self.tmp.name, sonda="sin_paq")
        self.assertEqual(os.listdir(os.path.join(self.tmp.name, "Library", "LaunchAgents")), [])
        self.assertIn("OMITIDO", salida)
        self.assertIn("no está instalado", salida)
        self.assertIn("pip install chatterbox-tts", salida)

    def test_solo_chatterbox_no_toca_otros_servicios(self):
        _modulo, _salida = _cargar(self.tmp.name, paquete_falso=True)
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(sorted(os.listdir(ag)), ["com.starseed.chatterbox.plist"])

    def test_interprete_que_no_existe_no_instala(self):
        # STARSEED_CHATTERBOX_PY apunta a un binario que no está: quien instala manda,
        # y aunque el paquete falso esté en PYTHONPATH no hay servicio.
        _modulo, salida = _cargar(
            self.tmp.name,
            paquete_falso=True,
            chatterbox_py=os.path.join(self.tmp.name, "no_hay_python"),
        )
        self.assertEqual(os.listdir(os.path.join(self.tmp.name, "Library", "LaunchAgents")), [])
        self.assertIn("OMITIDO", salida)
