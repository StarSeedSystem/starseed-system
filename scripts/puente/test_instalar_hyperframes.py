#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada «hyperframes» de instalar-servicios.py (Ola 1018H · HFR1018P).
HOME temporal y `subprocess.run` simulado: ni launchd, ni plutil, ni node, ni ffmpeg de verdad.
Las comprobaciones puras reciben sus datos ya leídos; el arranque usa sondas sustituidas.
"""
import importlib.util, io, os, plistlib, subprocess, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA = os.path.join(AQUI, "instalar-servicios.py")
RAIZ = os.path.dirname(os.path.dirname(AQUI))
PY3 = "/opt/homebrew/bin/python3"

def cargar(casa):
    """Carga el módulo sin instalar nada: STARSEED_SOLO=nada salta todos los servicios."""
    os.makedirs(os.path.join(casa, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_hyperframes", RUTA)
    modulo = importlib.util.module_from_spec(espec)
    entorno = {"HOME": casa, "STARSEED_SOLO": "nada", "STARSEED_RAIZ": RAIZ,
               "STARSEED_PY3": PY3, "STARSEED_NODE": "/opt/homebrew/bin/node"}
    def falso_run(*a, **k):
        return mock.Mock(returncode=0, stdout="", stderr="")
    with mock.patch.object(subprocess, "run", falso_run), mock.patch.dict(os.environ, entorno):
        try:
            espec.loader.exec_module(modulo)
        except SystemExit:
            pass
    return modulo

class ComprobacionesPuras(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = cargar(self.tmp.name)
    def test_version_node(self):
        self.assertEqual(self.mod.version_node("v22.23.3\n"), (22, 23, 3))
        self.assertEqual(self.mod.version_node("20.11.0"), (20, 11, 0))
        self.assertIsNone(self.mod.version_node("no hay node"))
        self.assertTrue(self.mod.node_suficiente("v22.0.0"))
        self.assertFalse(self.mod.node_suficiente("v20.19.9"))
    def test_variable_entorno(self):
        texto = "# comentario\nexport HYPERFRAMES_BROWSER_PATH=\"/opt/navegador\"\nOTRA=1\n"
        self.assertEqual(self.mod.variable_entorno(texto, "HYPERFRAMES_BROWSER_PATH"), "/opt/navegador")
        self.assertIsNone(self.mod.variable_entorno(texto, "NO_ESTA"))
        self.assertIsNone(self.mod.variable_entorno("HYPERFRAMES_BROWSER_PATH=\n", "HYPERFRAMES_BROWSER_PATH"))
    def test_motivo_sin_hyperframes(self):
        entorno = "HYPERFRAMES_BROWSER_PATH=/navegador\n"
        self.assertIsNone(self.mod.motivo_sin_hyperframes("v22.23.3", True, entorno, 8.0, es_mac=True))
        self.assertIn("Node 22", self.mod.motivo_sin_hyperframes("v20.0.0", True, entorno, 8.0))
        self.assertIn("ffmpeg", self.mod.motivo_sin_hyperframes("v22.0.0", False, entorno, 8.0))
        self.assertIn("HYPERFRAMES_BROWSER_PATH", self.mod.motivo_sin_hyperframes("v22.0.0", True, "OTRA=1"))
        self.assertIn("2 GB", self.mod.motivo_sin_hyperframes("v22.0.0", True, entorno, 1.9, es_mac=True))
        self.assertIsNone(self.mod.motivo_sin_hyperframes("v22.0.0", True, entorno, 1.9, es_mac=False))
    def test_entrada_con_el_patron_de_laya(self):
        orden, log, siempre = self.mod.SERVICIOS["hyperframes"]
        self.assertEqual(orden[:2], [PY3, os.path.join(AQUI, "lanzador-tcc.py")])
        self.assertEqual(orden[2], "--")
        self.assertTrue(orden[3].endswith("node"))
        self.assertTrue(orden[4].endswith(os.path.join("servicios", "hyperframes", "src", "servidor.mjs")))
        self.assertEqual(log, "/tmp/starseed-hyperframes.log")
        self.assertIs(siempre, True)


class Arranque(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.mod = cargar(self.tmp.name)
        self.plist = os.path.join(self.tmp.name, "Library", "LaunchAgents", "com.starseed.hyperframes.plist")

    def _intentar(self, es_mac=True, **cambios):
        sondas = {"_salida_node": lambda: "v22.23.3", "_hay_ffmpeg": lambda: True,
                  "_texto_entorno": lambda: "HYPERFRAMES_BROWSER_PATH=/navegador\n",
                  "_disco_libre_gb": lambda: 8.0}
        sondas.update(cambios)
        salida = io.StringIO()
        with mock.patch.multiple(self.mod, **sondas), mock.patch.object(self.mod, "ES_MAC", es_mac), \
                mock.patch.object(subprocess, "run", lambda *a, **k: mock.Mock(returncode=0, stdout="", stderr="")):
            with redirect_stdout(salida):
                hecho = self.mod.instalar_hyperframes()
        return hecho, salida.getvalue()

    def test_instala_si_la_neurona_puede(self):
        hecho, _ = self._intentar()
        self.assertTrue(hecho)
        with open(self.plist, "rb") as f:
            p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.hyperframes")
        self.assertIs(p["KeepAlive"], True)
        self.assertEqual(p["StandardOutPath"], "/tmp/starseed-hyperframes.log")
        self.assertEqual(p["StandardErrorPath"], p["StandardOutPath"])
        self.assertEqual(p["ProgramArguments"][0], PY3)
        self.assertTrue(p["ProgramArguments"][1].endswith("lanzador-tcc.py"))
        self.assertTrue(p["ProgramArguments"][4].endswith("servidor.mjs"))

    def test_omite_sin_node_22_sin_ffmpeg_o_sin_navegador(self):
        casos = [({"_salida_node": lambda: "v20.19.0"}, "Node 22"),
                 ({"_hay_ffmpeg": lambda: False}, "ffmpeg"),
                 ({"_texto_entorno": lambda: "OTRA=1\n"}, "HYPERFRAMES_BROWSER_PATH")]
        for cambios, esperado in casos:
            with self.subTest(esperado=esperado):
                hecho, salida = self._intentar(**cambios)
                self.assertFalse(hecho)
                self.assertIn(esperado, salida)
                self.assertFalse(os.path.exists(self.plist))

    def test_en_la_mac_nunca_con_menos_de_dos_gigas(self):
        hecho, salida = self._intentar(_disco_libre_gb=lambda: 1.5)
        self.assertFalse(hecho)
        self.assertIn("2 GB", salida)
        self.assertFalse(os.path.exists(self.plist))
        hecho, _ = self._intentar(es_mac=False, _disco_libre_gb=lambda: 1.5)
        self.assertTrue(hecho)


if __name__ == "__main__":
    unittest.main()
