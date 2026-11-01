#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional de Blender (BLD1025K), con todo SIMULADO: sin uvx, sin red.

Uso: python3 -m unittest servicios/blender-3d/test_puente_mcp.py
"""
import json, stat, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import taller as T  # noqa: E402
import puente_mcp as P  # noqa: E402


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class Falso:
    """Ejecutor simulado: responde a lsof y ss con lo que se le diga y registra toda orden."""

    def __init__(self, lsof="", ss=""):
        self.salidas = {"lsof": lsof, "ss": ss}
        self.ordenes = []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        nombre = Path(orden[0]).name
        if nombre in self.salidas:
            texto = self.salidas[nombre]
            return Res(0, texto or "", "") if texto is not None else Res(1, "", "no existe")
        return Res(1, "", "no existe")


LSOF_LOCAL = ("COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n"
              "Blender 42 persona 10u IPv4 0x0 0t0 TCP 127.0.0.1:9876 (LISTEN)\n")
SS_CABECERA = "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n"
SS_LOCAL = SS_CABECERA + "LISTEN 0 4096 127.0.0.1:9876 0.0.0.0:*\n"


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Darwin"):
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma,
                         maquina="arm64", entorno={})

    def test_seguros_imponen_telemetria_modo_seguro_y_host(self):
        entorno = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0",
                                "BLENDER_MCP_HOST": "0.0.0.0", "OPENAI_API_KEY": "x", "HTTPS_PROXY": "y"})
        self.assertEqual((entorno["DISABLE_TELEMETRY"], entorno["BLENDER_MCP_SAFE_MODE"],
                          entorno["BLENDER_MCP_HOST"]), ("true", "1", "127.0.0.1"))
        self.assertNotIn("OPENAI_API_KEY", entorno)
        self.assertNotIn("HTTPS_PROXY", entorno)

    def test_herramientas_solo_lectura(self):
        lista = ["execute_blender_code", "get_scene_info", "look", "generate_3d", "search_assets",
                 "import_asset", "get_addon_status", "disable_telemetry", "record_trajectory_feedback", "inventada"]
        self.assertEqual(P.herramientas_para_agentes(lista), ["get_scene_info", "look", "get_addon_status"])
        self.assertEqual(P.herramientas_para_agentes([{"name": "look"}, {"name": "execute_blender_code"}]), ["look"])
        self.assertEqual(P.herramientas_para_agentes(["execute_blender_code"]), [])

    def test_puerto_solo_local_lsof(self):
        casos = [(LSOF_LOCAL, True),
                 ("Blender 42 persona 10u IPv4 0x0 0t0 TCP *:9876 (LISTEN)\n", False),
                 ("Blender 42 persona 10u IPv4 0x0 0t0 TCP 0.0.0.0:9876 (LISTEN)\n", False),
                 ("", False)]
        for salida, esperado in casos:
            ok, motivo = P.puerto_solo_local(self.sistema(Falso(lsof=salida, ss=None)), 9876)
            self.assertEqual(ok, esperado, f"{salida!r} → {motivo}")

    def test_puerto_solo_local_ss(self):
        casos = [(SS_LOCAL, True),
                 (SS_CABECERA + "LISTEN 0 4096 *:9876 *:*\n", False),
                 (SS_CABECERA + "LISTEN 0 4096 0.0.0.0:9876 0.0.0.0:*\n", False),
                 (SS_CABECERA, False)]
        for salida, esperado in casos:
            ok, motivo = P.puerto_solo_local(self.sistema(Falso(lsof=None, ss=salida), "Linux"), 9876)
            self.assertEqual(ok, esperado, f"{salida!r} → {motivo}")

    def test_candidato_600_sin_secretos_ni_rutas_absolutas(self):
        plan = P.plan_puente(self.sistema(Falso(lsof="", ss=None)))
        ruta = P.escribir_candidato(plan, self.raiz)
        self.assertIsNotNone(ruta)
        self.assertTrue(ruta.exists())
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        texto = ruta.read_text(encoding="utf-8")
        for prohibido in ("KEY", "TOKEN", "SECRET", "PASSWORD", "/Users/", "/home/", "/opt/", str(self.raiz)):
            self.assertNotIn(prohibido, texto)
        dato = json.loads(texto)
        self.assertEqual(dato["servidor"]["entorno"]["DISABLE_TELEMETRY"], "true")
        self.assertEqual(dato["puerto"]["host"], "127.0.0.1")
        self.assertFalse(dato["puerto"]["escucha_solo_local"])

    def test_ninguna_funcion_ejecuta_uvx_pip_curl(self):
        falso = Falso(lsof=SS_LOCAL, ss=SS_LOCAL)
        s = self.sistema(falso)
        P.escribir_candidato(P.plan_puente(s), self.raiz)
        self.assertTrue(falso.ordenes)
        for orden in falso.ordenes:
            for prohibido in ("uvx", "pip", "curl"):
                self.assertNotIn(prohibido, " ".join(orden))
