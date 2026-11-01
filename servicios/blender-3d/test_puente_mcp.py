#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K)."""
import json, os, stat, subprocess, tempfile
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

sys_path = str(Path(__file__).resolve().parents[1] / "blender-3d")
import sys
sys.path.insert(0, sys_path)
from puente_mcp import seguros_de, herramientas_para_agentes, puerto_solo_local, plan_puente, escribir_candidato


class Res:
    def __init__(self, rc=0, out="", err=""):
        self.returncode, self.stdout, self.stderr = rc, out, err


class TestSegurosDe(unittest.TestCase):
    def test_con_telemetria_encendida_falla(self):
        entorno = {"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "1"}
        with self.assertRaises(ValueError):
            seguros_de(entorno)

    def test_sin_blender_mcp_safe_mode_falla(self):
        entorno = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "0"}
        with self.assertRaises(ValueError):
            seguros_de(entorno)

    def test_todos_los_seguro_ok(self):
        entorno = {"DISABLE_TELEMETRY": "true", "BLENDER_MCP_SAFE_MODE": "1"}
        resultado = seguros_de(entorno)
        self.assertEqual(resultado["host"], "127.0.0.1")
        self.assertEqual(resultado["port"], 9876)
        self.assertEqual(resultado["DISABLE_TELEMETRY"], "true")
        self.assertEqual(resultado["BLENDER_MCP_SAFE_MODE"], "1")


class TestHerramientasParaAgentes(unittest.TestCase):
    def test_quita_execute_blender_code(self):
        entrada = ["get_scene_info", "look", "execute_blender_code", "get_addon_status"]
        resultado = herramientas_para_agentes(entrada)
        self.assertNotIn("execute_blender_code", resultado)
        self.assertIn("get_scene_info", resultado)
        self.assertIn("look", resultado)
        self.assertIn("get_addon_status", resultado)

    def test_quita_generar_3d_y_search_assets(self):
        entrada = ["generate_3d", "search_assets", "get_scene_info"]
        resultado = herramientas_para_agentes(entrada)
        self.assertNotIn("generate_3d", resultado)
        self.assertNotIn("search_assets", resultado)
        self.assertIn("get_scene_info", resultado)

    def test_quita_disable_telemetry_y_record(self):
        entrada = ["disable_telemetry", "record_trajectory_feedback", "look"]
        resultado = herramientas_para_agentes(entrada)
        self.assertNotIn("disable_telemetry", resultado)
        self.assertNotIn("record_trajectory_feedback", resultado)
        self.assertIn("look", resultado)

    def test_pasa_solo_lectura(self):
        entrada = ["get_scene_info", "look", "get_addon_status", "otro"]
        resultado = herramientas_para_agentes(entrada)
        self.assertIn("get_scene_info", resultado)
        self.assertIn("look", resultado)
        self.assertIn("get_addon_status", resultado)


class TestPuertoSoloLocal(unittest.TestCase):
    @patch("subprocess.check_output")
    def test_127_0_0_1_ok(self, mock_check):
        mock_check.return_value = "blender-agent 1234  USER  1234u  IPv4 0x200000001 0t0  TCP 127.0.0.1:9876 (LISTEN)\n"
        ok, motivo = puerto_solo_local(None, 9876)
        self.assertTrue(ok)
        self.assertIn("127.0.0.1", motivo)

    @patch("subprocess.check_output")
    def test_estrella_no_ok(self, mock_check):
        mock_check.return_value = "blender-agent 1234  USER  1234u  TCP *:9876 (LISTEN)\n"
        ok, motivo = puerto_solo_local(None, 9876)
        self.assertFalse(ok)
        self.assertNotIn("ok", motivo)

    @patch("subprocess.check_output")
    def test_0_0__0_no_ok(self, mock_check):
        mock_check.return_value = "blender-agent 1234  USER  1234u  TCP 0.0.0.0:9876 (LISTEN)\n"
        ok, motivo = puerto_solo_local(None, 9876)
        self.assertFalse(ok)
        self.assertNotIn("ok", motivo)

    @patch("subprocess.check_output")
    def test_sin_escucha_no_ok(self, mock_check):
        mock_check.return_value = ""
        ok, motivo = puerto_solo_local(None, 9876)
        self.assertFalse(ok)
        self.assertNotIn("ok", motivo)


class TestPlanPuente(unittest.TestCase):
    def test_tiene_componentes(self):
        plan = plan_puente(None)
        self.assertIn("titulo", plan)
        self.assertIn("por_que", plan)
        self.assertIn("como", plan)
        self.assertIn("configuracion_candidata", plan)
        self.assertIn("avisos", plan)

    def test_aviso_licencia(self):
        plan = plan_puente(None)
        self.assertIn("MIT", plan["avisos"]["licencia"])

    def test_aviso_telemetria(self):
        plan = plan_puente(None)
        self.assertIn("TELEMETRY", plan["avisos"]["telemetria"])

    def test_menciona_hunyuan(self):
        plan = plan_puente(None)
        self.assertIn("Hunyuan3D", plan["avisos"]["licencia"])


class TestEscribirCandidato(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.raiz = Path(self.tmp_dir)

    def test_escribe_con_permisos_600(self):
        plan = {"titulo": "test", "por_que": "test", "como": [], "configuracion_candidata": {}, "avisos": {}}
        escribir_candidato(plan, self.raiz)
        carpeta = Path(self.tmp_dir) / ".starseed" / "blender-3d"
        archivo = carpeta / "puente-mcp.candidato.json"
        if archivo.exists():
            modo = stat.S_IMODE(archivo.stat().st_mode)
            self.assertEqual(modo, 0o600)
        else:
            self.skipTest("Archivo no creado")

    def test_sin_rutas_absolutas(self):
        plan = {"titulo": "test", "por_que": "test", "como": [], "configuracion_candidata": {}, "avisos": {}}
        escribir_candidato(plan, self.raiz)
        carpeta = Path(self.tmp_dir) / ".starseed" / "blender-3d"
        archivo = carpeta / "puente-mcp.candidato.json"
        if archivo.exists():
            contenido = archivo.read_text(encoding="utf-8")
            self.assertNotIn("/home/", contenido)
            self.assertNotIn("/Users/", contenido)
            self.assertNotIn("/opt/", contenido)
        else:
            self.skipTest("Archivo no creado")

    def test_json_valido(self):
        plan = {"titulo": "test", "pasos": ["1. Instalar"], "avisos": {}}
        escribir_candidato(plan, self.raiz)
        archivo = Path(self.tmp_dir) / ".starseed" / "blender-3d" / "puente-mcp.candidato.json"
        cargado = json.loads(archivo.read_text(encoding="utf-8"))
        self.assertEqual(cargado["pasos"], ["1. Instalar"])


class TestNingunEjecutaComandos(unittest.TestCase):
    def test_siguen_sin_uvx_pip_curl(self):
        codigo = """
from puente_mcp import seguros_de, herramientas_para_agentes, puerto_solo_local, plan_puente, escribir_candidato
        """
        for func_name in ["seguros_de", "herramientas_para_agentes", "puerto_solo_local", "plan_puente", "escribir_candidato"]:
            func = globals()[func_name]
            src = func.__code__.co_src if hasattr(func.__code__, "co_src") else ""
            self.assertNotIn("uvx", src)
            self.assertNotIn("pip ", src)
            self.assertNotIn("curl", src)


if __name__ == "__main__":
    unittest.main()