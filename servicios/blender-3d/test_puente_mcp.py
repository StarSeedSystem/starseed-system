#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional de Blender (BLD1025K; contrato §1.6)."""
import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import taller as T  # noqa: E402
import puente_mcp as P  # noqa: E402

class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""

class Falso:
    def __init__(self, salida=""):
        self.salida = salida
        self.ordenes = []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        return Res(0, self.salida)

def sistema(falso, plataforma="Linux"):
    return T.Sistema(raiz=Path("."), ejecutar=falso, plataforma=plataforma, maquina="x86_64",
                     entorno={}, buscar=lambda _n: None)

LSOF = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n"

def lsof(direccion):
    return LSOF + "Blender 111 alex 12u IPv4 0x1 0t0 TCP %s (LISTEN)\n" % direccion

def ss(direccion):
    return ("State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n"
            "LISTEN 0 128 %s 0.0.0.0:*\n" % direccion)

class SegurosTest(unittest.TestCase):
    def test_telemetria_no_se_puede_dejar_encendida(self):
        limpio = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0",
                               "BLENDER_MCP_HOST": "0.0.0.0"})
        self.assertEqual(limpio["DISABLE_TELEMETRY"], "true")
        self.assertEqual(limpio["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(limpio["BLENDER_MCP_HOST"], "127.0.0.1")

    def test_quita_claves_y_proxies(self):
        limpio = P.seguros_de({"PATH": "/usr/bin", "OPENROUTER_API_KEY": "x",
                               "HTTPS_PROXY": "http://ejemplo", "MI_TOKEN": "y"})
        self.assertEqual(limpio["PATH"], "/usr/bin")
        for clave in limpio:
            for prohibido in ("KEY", "TOKEN", "SECRET", "PROXY"):
                self.assertNotIn(prohibido, clave)
        self.assertEqual(P.seguros_de(None)["BLENDER_MCP_SAFE_MODE"], "1")

class HerramientasTest(unittest.TestCase):
    def test_solo_lectura(self):
        pedidas = ["execute_blender_code", "get_scene_info", "generate_3d", "look",
                   "search_assets", "import_asset", "disable_telemetry",
                   "record_trajectory_feedback", "get_addon_status", "otra_cosa", 7]
        self.assertEqual(P.herramientas_para_agentes(pedidas),
                         ["get_scene_info", "look", "get_addon_status"])

    def test_lista_rara_vacia(self):
        self.assertEqual(P.herramientas_para_agentes("get_scene_info"), [])
        self.assertEqual(P.herramientas_para_agentes(None), [])

class PuertoTest(unittest.TestCase):
    def caso(self, plataforma, salida):
        return P.puerto_solo_local(sistema(Falso(salida), plataforma))

    def test_lsof(self):
        self.assertTrue(self.caso("Darwin", lsof("127.0.0.1:9876"))[0])
        for mala in ("*:9876", "0.0.0.0:9876"):
            ok, motivo = self.caso("Darwin", lsof(mala))
            self.assertFalse(ok, mala)
            self.assertIn("no solo en 127.0.0.1", motivo)
        ok, motivo = self.caso("Darwin", LSOF)
        self.assertFalse(ok)
        self.assertIn("nadie escucha", motivo)

    def test_ss(self):
        self.assertTrue(self.caso("Linux", ss("127.0.0.1:9876"))[0])
        for mala in ("*:9876", "0.0.0.0:9876"):
            self.assertFalse(self.caso("Linux", ss(mala))[0], mala)
        self.assertFalse(self.caso("Linux", ss("127.0.0.1:9002"))[0])
        self.assertFalse(self.caso("Linux", "")[0])

class CandidatoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def test_se_escribe_600_sin_claves_ni_rutas(self):
        plan = P.plan_puente(sistema(Falso(lsof("127.0.0.1:9876")), "Darwin"))
        ruta = P.escribir_candidato(plan, self.raiz)
        self.assertEqual(ruta, self.raiz / "blender-3d" / "puente-mcp.candidato.json")
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        texto = ruta.read_text(encoding="utf-8")
        datos = json.loads(texto)
        env = datos["configuracion_candidata"]["mcpServers"]["mcp-for-blender"]["env"]
        self.assertEqual(env["DISABLE_TELEMETRY"], "true")
        self.assertEqual(env["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(datos["herramientas_para_agentes"],
                         ["get_scene_info", "look", "get_addon_status"])
        for prohibido in ("/Users/", "/home/", r"C:\Users", "API_KEY", "TOKEN", "SECRET"):
            self.assertNotIn(prohibido, texto)
        self.assertIn("MIT", texto)
        self.assertIn("Hunyuan3D", texto)

    def test_no_ejecuta_uvx_pip_curl(self):
        falso = Falso()
        P.plan_puente(sistema(falso, "Linux"))
        P.escribir_candidato(P.plan_puente(sistema(falso, "Linux")), self.raiz)
        binarios = {Path(o[0]).name for o in falso.ordenes}
        self.assertTrue(binarios <= {"ss", "lsof"}, binarios)
