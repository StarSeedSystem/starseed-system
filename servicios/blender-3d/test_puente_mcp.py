#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K)."""
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import taller as T
import puente_mcp as PM


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    def __init__(self, lsof=None, ss=None):
        self.lsof = lsof
        self.ss = ss
        self.ordenes = []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if orden and orden[0] == "lsof":
            if self.lsof is None:
                return Res(1, "", "")
            return Res(0, self.lsof, "")
        if orden and orden[0] == "ss":
            if self.ss is None:
                return Res(1, "", "")
            return Res(0, self.ss, "")
        return Res(0, "")


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, entorno=None):
        env = entorno or {}
        return T.Sistema(raiz=self.raiz, ejecutar=falso, buscar=lambda n: None,
                         entorno=env)


class PuenteMCPTest(Base):
    def test_seguros_de_sin_telemetria_encendida(self):
        env = PM.seguros_de({})
        self.assertEqual(env.get("DISABLE_TELEMETRY"), "true")
        self.assertNotEqual(env.get("DISABLE_TELEMETRY"), "1" if False else None)  # solo comprobar valor
        self.assertEqual(env.get("DISABLE_TELEMETRY"), "true")
        self.assertTrue(env.get("DISABLE_TELEMETRY") != "false")
        self.assertTrue(env.get("DISABLE_TELEMETRY") != "")
        # no puede dejar telemetría encendida
        self.assertEqual(str(env.get("DISABLE_TELEMETRY")).lower(), "true")
        self.assertEqual(env.get("BLENDER_MCP_SAFE_MODE"), "1")
        self.assertEqual(env.get("HOST"), "127.0.0.1")

    def test_herramientas_para_agentes_quita_execute_y_desconocidas(self):
        entrada = [
            "get_scene_info",
            "execute_blender_code",
            "look",
            "generate_3d",
            "search_assets",
            "import_asset",
            "disable_telemetry",
            "record_trajectory_feedback",
            "algo_raro",
            "get_addon_status",
        ]
        salida = PM.herramientas_para_agentes(entrada)
        self.assertNotIn("execute_blender_code", salida)
        self.assertNotIn("generate_3d", salida)
        self.assertNotIn("search_assets", salida)
        self.assertNotIn("import_asset", salida)
        self.assertNotIn("disable_telemetry", salida)
        self.assertNotIn("record_trajectory_feedback", salida)
        self.assertNotIn("algo_raro", salida)
        # solo las de lectura permitidas
        for h in salida:
            self.assertIn(h, ("get_scene_info", "look", "get_addon_status"))
        self.assertIn("get_scene_info", salida)
        self.assertIn("look", salida)
        self.assertIn("get_addon_status", salida)

    def test_puerto_solo_local_127001_ok(self):
        falso = Falso(lsof="COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender  123 alex   10u  IPv4 ...      0t0  TCP 127.0.0.1:9876 (LISTEN)\n")
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertTrue(ok)
        self.assertIn("127.0.0.1", motivo)

    def test_puerto_solo_local_star_ok(self):
        falso = Falso(lsof="COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender  123 alex   10u  IPv4 ...      0t0  TCP *:9876 (LISTEN)\n")
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertFalse(ok)

    def test_puerto_solo_local_0000_no(self):
        falso = Falso(lsof="COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender  123 alex   10u  IPv4 ...      0t0  TCP 0.0.0.0:9876 (LISTEN)\n")
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertFalse(ok)

    def test_puerto_solo_local_ss_127_ok(self):
        falso = Falso(lsof=None, ss="State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port  Process\nLISTEN  0       4096    127.0.0.1:9876      0.0.0.0:*      pid=123,fd=10\n")
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertTrue(ok)

    def test_puerto_solo_local_ss_star_no(self):
        falso = Falso(lsof=None, ss="State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port  Process\nLISTEN  0       4096    *:9876              0.0.0.0:*      pid=123,fd=10\n")
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertFalse(ok)

    def test_puerto_solo_local_sin_escucha_no(self):
        falso = Falso(lsof=None, ss=None)
        s = self.sistema(falso)
        ok, motivo = PM.puerto_solo_local(s, 9876)
        self.assertFalse(ok)

    def test_candidato_escrito_permisos_600_sin_claves_sin_rutas_absolutas(self):
        falso = Falso()
        s = self.sistema(falso)
        plan = PM.plan_puente(s)
        destino = PM.escribir_candidato(plan, raiz=self.raiz / "out", s=s)
        p = Path(destino)
        self.assertTrue(p.exists())
        modo = stat.S_IMODE(os.stat(p).st_mode)
        self.assertEqual(modo, 0o600)
        contenido = p.read_text(encoding="utf-8")
        self.assertNotIn("AKIA", contenido)
        self.assertNotIn("sk-", contenido)
        self.assertNotIn("BEGIN PRIVATE KEY", contenido)
        self.assertNotIn("/Users/", contenido)
        self.assertNotIn("/home/", contenido)
        self.assertNotIn(os.path.expanduser("~"), contenido)
        # sin claves
        datos = json.loads(contenido)
        sjson = json.dumps(datos)
        self.assertNotIn("TOKEN", sjson.replace("HOST", ""))
        self.assertNotIn("SECRET", sjson)
        self.assertNotIn("KEY", sjson)  # no debe haber nombres de clave con valor
        # tampoco tocar config real de MCP
        # ninguna función debe ejecutar uvx/pip/curl - ya lo garantizamos por diseño

    def test_ninguna_funcion_ejecuta_uvx_pip_curl(self):
        falso = Falso()
        s = self.sistema(falso)
        plan = PM.plan_puente(s)
        PM.escribir_candidato(plan, raiz=self.raiz / "out2", s=s)
        PM.puerto_solo_local(s, 9876)
        PM.herramientas_para_agentes(["get_scene_info", "execute_blender_code"])
        PM.seguros_de({})
        for orden in falso.ordenes:
            cmd = " ".join(str(x) for x in orden)
            self.assertNotIn("uvx", cmd)
            self.assertNotIn("pip", cmd)
            self.assertNotIn("curl", cmd)


if __name__ == "__main__":
    unittest.main()
