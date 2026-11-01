#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional de Blender (BLD1025K, contrato §1.6).

Comprueban los tres seguros: telemetría apagada, herramientas de solo lectura y
socket únicamente en 127.0.0.1. No ejecutan uvx, pip ni curl y no abren puertos.
"""
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P

class Falso:
    """Sistema inyectable: devuelve la salida simulada de lsof o ss y apunta las órdenes."""

    def __init__(self, plataforma="Linux", salidas=None, texto=""):
        self.plataforma = plataforma
        self.salidas = salidas or {}
        self.texto = texto
        self.ordenes = []

    def salida(self, orden, timeout=10):
        self.ordenes.append(list(orden))
        return self.salidas.get(orden[0], self.texto)


class SegurosTest(unittest.TestCase):
    def test_no_deja_la_telemetria_encendida(self):
        entrada = {"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0",
                   "BLENDER_HOST": "0.0.0.0", "API_KEY": "no-real"}
        seguros = P.seguros_de(entrada)
        self.assertEqual(seguros["DISABLE_TELEMETRY"], "true")
        self.assertEqual(seguros["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(seguros["BLENDER_HOST"], "127.0.0.1")
        self.assertNotIn("API_KEY", seguros)
        self.assertEqual(entrada["DISABLE_TELEMETRY"], "false")

    def test_solo_pasan_las_herramientas_de_lectura(self):
        entrada = ["get_scene_info", "execute_blender_code", "look", "generate_3d", "search_assets",
                   "import_asset", "disable_telemetry", "record_trajectory_feedback", "get_addon_status", "inventada"]
        permitidas = P.herramientas_para_agentes(entrada)
        self.assertEqual(permitidas, ["get_scene_info", "look", "get_addon_status"])
        self.assertNotIn("execute_blender_code", permitidas)
        self.assertEqual(P.herramientas_para_agentes([]), [])
        self.assertEqual(P.herramientas_para_agentes(None), [])


class PuertoTest(unittest.TestCase):
    def test_solo_acepta_127_0_0_1(self):
        cab_lsof = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\n"
        cab_ss = "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n"
        casos = [
            ("Darwin", cab_lsof + "Blender 1 a 1u IPv4 0x1 0t0 TCP 127.0.0.1:9876 (LISTEN)\n", "lsof", True),
            ("Darwin", cab_lsof + "Blender 1 a 1u IPv4 0x1 0t0 TCP *:9876 (LISTEN)\n", "lsof", False),
            ("Darwin", cab_lsof + "Blender 1 a 1u IPv4 0x1 0t0 TCP 0.0.0.0:9876 (LISTEN)\n", "lsof", False),
            ("Darwin", cab_lsof, "lsof", False),
            ("Linux", cab_ss + "LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n", "ss", True),
            ("Linux", cab_ss + "LISTEN 0 128 *:9876 *:*\n", "ss", False),
            ("Linux", cab_ss + "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*\n", "ss", False),
            ("Linux", cab_ss + "LISTEN 0 128 [::]:9876 [::]:*\n", "ss", False),
            ("Linux", cab_ss, "ss", False),
        ]
        for plataforma, texto, comando, esperado in casos:
            with self.subTest(texto=texto):
                s = Falso(plataforma, texto=texto)
                ok, motivo = P.puerto_solo_local(s)
                self.assertEqual(ok, esperado)
                self.assertTrue(motivo)
                self.assertEqual(s.ordenes[0][0], comando)


class PlanTest(unittest.TestCase):
    def test_plan_explicado_con_avisos(self):
        s = Falso("Linux", texto="LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n")
        plan = P.plan_puente(s)
        self.assertIn("qué", plan["que_es"].lower())
        self.assertIn("por qué", plan["por_que"].lower())
        self.assertGreaterEqual(len(plan["como"]), 3)
        self.assertEqual(plan["configuracion"]["mcpServers"]["blender"]["command"], "uvx")
        self.assertEqual(plan["herramientas"], ["get_scene_info", "look", "get_addon_status"])
        avisos = " ".join(plan["avisos"]).lower()
        self.assertIn("mit", avisos)
        self.assertIn("hunyuan3d", avisos)
        self.assertIn("ue", avisos)
        self.assertIn("telemetría", avisos)
        self.assertTrue(plan["estado_puerto"]["ok"])

    def test_candidato_600_sin_claves_ni_rutas(self):
        with tempfile.TemporaryDirectory() as tmp:
            plan = P.plan_puente(Falso("Linux", texto="LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n"))
            ruta = P.escribir_candidato(plan, tmp)
            self.assertEqual(ruta, Path(tmp) / "puente-mcp.candidato.json")
            self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
            texto = ruta.read_text(encoding="utf-8")
            self.assertEqual(json.loads(texto), plan)
            for prohibido in ("/Users/", "/home/", "API_KEY", "SECRET", "sk-"):
                self.assertNotIn(prohibido, texto)

    def test_ninguna_funcion_lanza_uvx_pip_ni_curl(self):
        s = Falso("Linux", texto="LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n")
        P.puerto_solo_local(s)
        P.plan_puente(s)
        self.assertTrue(s.ordenes)
        for orden in s.ordenes:
            self.assertNotIn(Path(str(orden[0])).name, ("uvx", "pip", "pip3", "curl", "sh", "bash"))
        fuente = Path(P.__file__ or "puente_mcp.py").read_text(encoding="utf-8")
        self.assertNotIn("subprocess", fuente)
        self.assertNotIn("os.system", fuente)
        self.assertNotIn("os.popen", fuente)


if __name__ == "__main__":
    unittest.main()
