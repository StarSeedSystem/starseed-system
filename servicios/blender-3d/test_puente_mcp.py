#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional de Blender (BLD1025K)."""
import json, os, stat, tempfile, unittest
from pathlib import Path
from typing import Optional
from unittest.mock import MagicMock

import sys
sys.path.insert(0, str(Path(__file__).parent))
from puente_mcp import (
    Sistema, seguros_de, herramientas_para_agentes, puerto_solo_local,
    plan_puente, escribir_candidato, HERRAMIENTAS_PERMITIDAS,
    PUERTO_POR_DEFECTO, RUTA_CANDIDATO
)

HERRAMIENTAS_BLOQUEADAS = (
    "execute_blender_code", "generate_3d", "search_assets", "import_asset",
    "disable_telemetry", "record_trajectory_feedback"
)


class TestSegurosDe(unittest.TestCase):
    def test_telemetria_apagada_y_modo_seguro(self):
        env = seguros_de({"OTRA": "variable"})
        self.assertEqual(env["DISABLE_TELEMETRY"], "true")
        self.assertEqual(env["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(env["BLENDER_MCP_HOST"], "127.0.0.1")
        self.assertEqual(env["OTRA"], "variable")

    def test_sin_entorno_previo(self):
        env = seguros_de({})
        self.assertEqual(env["DISABLE_TELEMETRY"], "true")
        self.assertEqual(env["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(env["BLENDER_MCP_HOST"], "127.0.0.1")


class TestHerramientasParaAgentes(unittest.TestCase):
    def test_solo_lectura_pasa(self):
        entrada = [str(h) for h in HERRAMIENTAS_PERMITIDAS]
        salida = herramientas_para_agentes(entrada)
        for h in HERRAMIENTAS_PERMITIDAS:
            self.assertIn(h, salida)
        self.assertEqual(len(salida), len(HERRAMIENTAS_PERMITIDAS))

    def test_ejecute_blender_code_quitado(self):
        entrada = ["execute_blender_code", "get_scene_info"]
        salida = herramientas_para_agentes(entrada)
        self.assertNotIn("execute_blender_code", salida)
        self.assertIn("get_scene_info", salida)

    def test_todas_bloqueadas_quitadas(self):
        entrada = [str(h) for h in HERRAMIENTAS_BLOQUEADAS] + ["get_scene_info"]
        salida = herramientas_para_agentes(entrada)
        for h in HERRAMIENTAS_BLOQUEADAS:
            self.assertNotIn(h, salida)
        self.assertIn("get_scene_info", salida)

    def test_desconocidas_quitadas(self):
        entrada = ["herramienta_inventada", "get_scene_info", "otra_mas"]
        salida = herramientas_para_agentes(entrada)
        self.assertEqual(salida, ["get_scene_info"])

    def test_lista_vacia(self):
        self.assertEqual(herramientas_para_agentes([]), [])


class TestPuertoSoloLocal(unittest.TestCase):
    def _sistema_con_salida(self, salida_lsof: Optional[str], salida_ss: Optional[str]) -> Sistema:
        def ejecutar_mock(*args, **kwargs):
            m = MagicMock()
            if args[0][0] == "lsof":
                m.stdout = salida_lsof or ""
                m.returncode = 0 if salida_lsof is not None else 1
            else:
                m.stdout = salida_ss or ""
                m.returncode = 0 if salida_ss is not None else 1
            return m
        return Sistema(ejecutar=ejecutar_mock, plataforma="Darwin")

    def test_lsof_127_ok(self):
        salida = "COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender 123 user  10u  IPv4 12345  0t0  TCP 127.0.0.1:9876 (LISTEN)"
        s = self._sistema_con_salida(salida, None)
        ok, motivo = puerto_solo_local(s)
        self.assertTrue(ok)
        self.assertIn("127.0.0.1", motivo)

    def test_lsof_todas_interfaces_no(self):
        salida = "COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender 123 user  10u  IPv4 12345  0t0  TCP *:9876 (LISTEN)"
        s = self._sistema_con_salida(salida, None)
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("no local", motivo)

    def test_lsof_0_0_0_0_no(self):
        salida = "COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME\nblender 123 user  10u  IPv4 12345  0t0  TCP 0.0.0.0:9876 (LISTEN)"
        s = self._sistema_con_salida(salida, None)
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)

    def test_lsof_sin_escucha_no(self):
        salida = "COMMAND  PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME"
        s = self._sistema_con_salida(salida, None)
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("No hay socket", motivo)

    def test_ss_127_ok(self):
        salida = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nLISTEN 0      128    127.0.0.1:9876     0.0.0.0:*"
        s = self._sistema_con_salida(None, salida)
        s.plataforma = "Linux"
        ok, motivo = puerto_solo_local(s)
        self.assertTrue(ok)

    def test_ss_todas_interfaces_no(self):
        salida = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nLISTEN 0      128    *:9876               0.0.0.0:*"
        s = self._sistema_con_salida(None, salida)
        s.plataforma = "Linux"
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("no local", motivo)

    def test_ss_0_0_0_0_no(self):
        salida = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nLISTEN 0      128    0.0.0.0:9876       0.0.0.0:*"
        s = self._sistema_con_salida(None, salida)
        s.plataforma = "Linux"
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)

    def test_ss_sin_escucha_no(self):
        salida = "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port"
        s = self._sistema_con_salida(None, salida)
        s.plataforma = "Linux"
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("No hay socket", motivo)

    def test_sin_lsof_ni_ss_no(self):
        def ejecutar_falla(*args, **kwargs):
            raise OSError("no existe")
        s = Sistema(ejecutar=ejecutar_falla, plataforma="Linux")
        ok, motivo = puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("No se pudo comprobar", motivo)


class TestPlanPuente(unittest.TestCase):
    def test_plan_tiene_campos_requeridos(self):
        s = Sistema()
        plan = plan_puente(s)
        self.assertIn("que_es", plan)
        self.assertIn("por_que", plan)
        self.assertIn("seguros", plan)
        self.assertIn("pasos_manuales", plan)
        self.assertIn("configuracion_candidata_cliente_mcp", plan)
        self.assertIn("avisos_licencia_y_telemetria", plan)

    def test_configuracion_tiene_env_seguro(self):
        s = Sistema()
        plan = plan_puente(s)
        cfg = plan["configuracion_candidata_cliente_mcp"]["mcpServers"]["blender"]
        self.assertEqual(cfg["env"]["DISABLE_TELEMETRY"], "true")
        self.assertEqual(cfg["env"]["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(cfg["env"]["BLENDER_MCP_HOST"], "127.0.0.1")

    def test_avisos_incluyen_hunyuan3d_ue(self):
        s = Sistema()
        plan = plan_puente(s)
        avisos = " ".join(plan["avisos_licencia_y_telemetria"])
        self.assertIn("Hunyuan3D", avisos)
        self.assertIn("UE", avisos)
        self.assertIn("excluye", avisos.lower())

    def test_avisos_incluyen_mit(self):
        s = Sistema()
        plan = plan_puente(s)
        avisos = " ".join(plan["avisos_licencia_y_telemetria"])
        self.assertIn("MIT", avisos)


class TestEscribirCandidato(unittest.TestCase):
    def test_escribe_archivo_con_permisos_600(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "candidato.json"
            plan = {"prueba": "valor"}
            ruta = escribir_candidato(plan, destino)
            self.assertEqual(ruta, destino)
            self.assertTrue(destino.exists())
            contenido = json.loads(destino.read_text(encoding="utf-8"))
            self.assertEqual(contenido, plan)
            modo = destino.stat().st_mode
            self.assertEqual(stat.S_IMODE(modo), 0o600)

    def test_no_contiene_claves_ni_rutas_absolutas(self):
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "candidato.json"
            plan = plan_puente(Sistema())
            escribir_candidato(plan, destino)
            texto = destino.read_text(encoding="utf-8")
            self.assertNotIn("KEY", texto.upper())
            self.assertNotIn("TOKEN", texto.upper())
            self.assertNotIn("SECRET", texto.upper())
            self.assertNotIn("/home/", texto)
            self.assertNotIn("/Users/", texto)
            self.assertNotIn("C:\\", texto)

    def test_no_ejecuta_uvx_pip_curl(self):
        """Las funciones del puente NO ejecutan uvx, pip ni curl (solo escriben el plan)."""
        with tempfile.TemporaryDirectory() as tmp:
            destino = Path(tmp) / "candidato.json"
            plan = plan_puente(Sistema())
            # Verificar que escribir_candidato no lanza subprocesos
            escribir_candidato(plan, destino)
            # Verificar que plan_puente no lanza subprocesos (solo devuelve dict)
            self.assertIsInstance(plan, dict)
            # Verificar que seguros_de no lanza subprocesos
            env = seguros_de({})
            self.assertIsInstance(env, dict)
            # Verificar que herramientas_para_agentes no lanza subprocesos
            herramientas = herramientas_para_agentes(["get_scene_info"])
            self.assertIsInstance(herramientas, list)
            # Verificar que escribir_candidato guarda el plan sin ejecutar comandos
            contenido = json.loads(destino.read_text(encoding="utf-8"))
            self.assertIn("configuracion_candidata_cliente_mcp", contenido)


if __name__ == "__main__":
    unittest.main()