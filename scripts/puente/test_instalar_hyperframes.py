#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la entrada «hyperframes» de instalar-servicios.py (Ola 1018H · HFR1018P).

El módulo instala al importarse: se carga con HOME temporal y sondas simuladas (subprocess,
shutil, sys.platform) sobre un repo de mentira con su archivo `entorno`. Nada toca launchd,
la red, el navegador ni procesos reales.
"""
import importlib.util, io, os, plistlib, shutil, subprocess, sys, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
GUION = os.path.join(AQUI, "instalar-servicios.py")
NODO = "/opt/homebrew/bin/node"
ENTORNO = "HYPERFRAMES_BROWSER_PATH=/opt/headless/chrome\nHYPERFRAMES_NO_TELEMETRY=1\n"


def _repo(casa, con_navegador=True):
    """Repo de mentira con el `entorno` del servicio, para no leer el de verdad."""
    raiz = os.path.join(casa, "repo")
    os.makedirs(os.path.join(raiz, "scripts", "puente"))
    os.makedirs(os.path.join(raiz, "servicios", "hyperframes"))
    if con_navegador:
        with open(os.path.join(raiz, "servicios", "hyperframes", "entorno"), "w", encoding="utf-8") as f:
            f.write(ENTORNO)
    return raiz

def _cargar(casa, raiz, solo="hyperframes", version="v22.23.3", ffmpeg=True, disco_gb=10.0, plataforma="darwin"):
    """Carga el módulo con HOME temporal y sondas falsas; devuelve (módulo, órdenes, salida)."""
    os.makedirs(os.path.join(casa, "Library", "LaunchAgents"), exist_ok=True)
    espec = importlib.util.spec_from_file_location("instalar_hyperframes_%s" % id(raiz), GUION)
    assert espec is not None and espec.loader is not None
    modulo = importlib.util.module_from_spec(espec)
    ordenes = []

    def falso_run(orden, **kwargs):
        ordenes.append(list(orden))
        m = mock.Mock()
        m.returncode = 1 if (orden[:1] == ["ffmpeg"] and not ffmpeg) else 0
        m.stdout = version if orden[-1:] == ["-v"] else ""
        m.stderr = ""
        return m

    disco = mock.Mock(free=int(disco_gb * 1024 ** 3))
    entorno = {"HOME": casa, "STARSEED_SOLO": solo, "STARSEED_RAIZ": raiz, "STARSEED_HYPERFRAMES_ENTORNO": "",
               "STARSEED_PY3": "/opt/homebrew/bin/python3", "STARSEED_NODE": NODO}
    salida = io.StringIO()
    with mock.patch.object(subprocess, "run", falso_run), \
         mock.patch.object(shutil, "disk_usage", return_value=disco), \
         mock.patch.object(sys, "platform", plataforma), \
         mock.patch.dict(os.environ, entorno), redirect_stdout(salida):
        try:
            espec.loader.exec_module(modulo)
        except SystemExit:
            pass  # con STARSEED_SOLO el módulo termina con sys.exit(0)
    return modulo, ordenes, salida.getvalue()

class FuncionesPuras(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.mod, _o, _s = _cargar(cls.tmp.name, _repo(cls.tmp.name), solo="nada")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_version_node_ok(self):
        ok = self.mod.version_node_ok
        self.assertTrue(ok("v22.23.3")); self.assertTrue(ok("24.0.0"))
        self.assertFalse(ok("v20.11.1")); self.assertFalse(ok("")); self.assertFalse(ok("nada"))

    def test_entorno_tiene_navegador(self):
        tiene = self.mod.entorno_tiene_navegador
        self.assertTrue(tiene(ENTORNO)); self.assertTrue(tiene('HYPERFRAMES_BROWSER_PATH="/ruta/chrome"'))
        self.assertFalse(tiene("HYPERFRAMES_BROWSER_PATH=\n"))
        self.assertFalse(tiene("# HYPERFRAMES_BROWSER_PATH=/x\n")); self.assertFalse(tiene("OTRA=1\n"))

    def test_motivo_no_instalar_hyperframes(self):
        m = self.mod.motivo_no_instalar_hyperframes
        self.assertIsNone(m("v22.23.3", True, ENTORNO, 10.0, True))
        self.assertIn("Node 22", m("v20.11.1", True, ENTORNO, 10.0, True))
        self.assertIn("FFmpeg", m("v22.23.3", False, ENTORNO, 10.0, True))
        self.assertIn("HYPERFRAMES_BROWSER_PATH", m("v22.23.3", True, "", 10.0, True))
        self.assertIn("2 GB", m("v22.23.3", True, ENTORNO, 1.5, True))
        # En el A1 (Linux) el disco no bloquea: allí es la neurona de render por defecto.
        self.assertIsNone(m("v22.23.3", True, ENTORNO, 1.5, False))

class Instalacion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)

    def test_instala_con_todo(self):
        casa = self.tmp.name; _mod, ordenes, _salida = _cargar(casa, _repo(casa))
        ruta = os.path.join(casa, "Library", "LaunchAgents", "com.starseed.hyperframes.plist")
        with open(ruta, "rb") as f: p = plistlib.load(f)
        self.assertEqual(p["Label"], "com.starseed.hyperframes"); self.assertIs(p["KeepAlive"], True)
        self.assertEqual(p["StandardOutPath"], "/tmp/starseed-hyperframes.log")
        self.assertEqual(p["StandardErrorPath"], p["StandardOutPath"])
        args = p["ProgramArguments"]
        self.assertEqual(args[0], "/opt/homebrew/bin/python3"); self.assertTrue(args[1].endswith("lanzador-tcc.py"))
        self.assertEqual(args[args.index("--") + 1], NODO)
        self.assertTrue(args[-1].endswith("servicios/hyperframes/src/servidor.mjs"))
        self.assertFalse(any(a.endswith(("zsh", "bash")) for a in args))
        self.assertIn(["plutil", "-lint", ruta], ordenes)

    def test_sin_navegador_no_instala(self):
        casa = self.tmp.name; _mod, _ordenes, salida = _cargar(casa, _repo(casa, con_navegador=False))
        self.assertEqual(os.listdir(os.path.join(casa, "Library", "LaunchAgents")), [])
        self.assertIn("OMITIDO", salida); self.assertIn("HYPERFRAMES_BROWSER_PATH", salida)

    def test_mac_con_poco_disco_no_instala(self):
        casa = self.tmp.name; _mod, _ordenes, salida = _cargar(casa, _repo(casa), disco_gb=1.0)
        self.assertEqual(os.listdir(os.path.join(casa, "Library", "LaunchAgents")), [])
        self.assertIn("vista previa sí, render no", salida)


if __name__ == "__main__":
    unittest.main()
