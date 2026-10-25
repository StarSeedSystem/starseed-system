#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del servicio «chatterbox» de instalar-servicios.py (SGO1024E).

Solo se instala si el paquete «chatterbox-tts» está en el intérprete; la decisión se
comprueba con un subprocess simulado (nada toca launchd, la red ni archivos reales).
"""

import contextlib
import importlib.util
import io
import os
import plistlib
import subprocess
import tempfile
import unittest
from unittest import mock

_RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "instalar-servicios.py")


def _cargar_con_codigo_salida(carpeta, codigo=0, solo="chatterbox"):
    """Carga el módulo con un subprocess.run simulado que devuelve `codigo`."""
    os.makedirs(os.path.join(carpeta, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location(
        "instalar_servicios_chatterbox_prueba", _RUTA
    )
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    entorno = {
        "HOME": carpeta,
        "STARSEED_SOLO": solo,
        "STARSEED_RAIZ": repo_root,
        "STARSEED_PY3": "/opt/homebrew/bin/python3",
    }

    def falso_run(orden, **kwargs):
        m = mock.Mock()
        m.returncode, m.stdout, m.stderr = codigo, "", ""
        return m

    capturador = io.StringIO()
    with mock.patch.object(subprocess, "run", falso_run):
        with mock.patch.dict(os.environ, entorno):
            try:
                with contextlib.redirect_stdout(capturador):
                    espec.loader.exec_module(modulo)
            except SystemExit:
                pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo, capturador.getvalue()


class TestServicioChatterbox(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def test_paquete_instalado_crea_el_servicio(self):
        self.mod, self.salida = _cargar_con_codigo_salida(self.tmp.name, 0)
        ruta = os.path.join(
            self.tmp.name, "Library", "LaunchAgents", "com.starseed.chatterbox.plist"
        )
        self.assertTrue(os.path.exists(ruta))

    def test_paquete_ausente_no_instala_y_lo_dice(self):
        self.mod, self.salida = _cargar_con_codigo_salida(self.tmp.name, 1)
        ruta = os.path.join(
            self.tmp.name, "Library", "LaunchAgents", "com.starseed.chatterbox.plist"
        )
        self.assertFalse(os.path.exists(ruta))
        self.assertIn("chatterbox", self.salida)

    def test_funcion_decide_por_codigo_de_salida(self):
        mod, _s = _cargar_con_codigo_salida(self.tmp.name, 0)
        for codigo, esperado in ((0, True), (1, False)):
            def falso_run(orden, *args, _c=codigo, **kwargs):
                m = mock.Mock()
                m.returncode, m.stdout, m.stderr = _c, "", ""
                return m

            with mock.patch.object(subprocess, "run", falso_run):
                self.assertEqual(mod.chatterbox_instalado("/usr/bin/python3"), esperado)

    def test_plist_del_servicio(self):
        mod, _s = _cargar_con_codigo_salida(self.tmp.name, 0)
        ruta = os.path.join(
            self.tmp.name, "Library", "LaunchAgents", "com.starseed.chatterbox.plist"
        )
        with open(ruta, "rb") as f:
            plist = plistlib.load(f)
        self.assertEqual(plist["Label"], "com.starseed.chatterbox")
        # KeepAlive: el paquete está, el servicio vive (relanza si muere).
        self.assertIs(plist["KeepAlive"], True)
        self.assertIs(plist["RunAtLoad"], True)
        # El mismo patrón que los demás servicios de voz.
        self.assertEqual(plist["ProcessType"], "Interactive")
        args = plist["ProgramArguments"]
        self.assertTrue(any(a.endswith("lanzador-tcc.py") for a in args))
        # Ruta absoluta del intérprete antes del guion.
        self.assertTrue(all(os.path.isabs(a) for a in (args[0], args[-1])))
        self.assertTrue(args[-1].endswith("servidor.py"))
        self.assertEqual(
            os.path.dirname(os.path.dirname(args[-1])),
            os.path.join(
                os.path.dirname(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                ),
                "native",
                "astraura-voice",
            ),
        )
        self.assertEqual(mod.SERVICIOS.get("chatterbox"), None)
        self.assertEqual(mod.PERIODICOS.get("chatterbox"), None)

    def test_chatterbox_no_toca_otros_servicios(self):
        _mod, _s = _cargar_con_codigo_salida(self.tmp.name, 0)
        ag = os.path.join(self.tmp.name, "Library", "LaunchAgents")
        self.assertEqual(
            sorted(os.listdir(ag)), ["com.starseed.chatterbox.plist"]
        )


if __name__ == "__main__":
    unittest.main()
