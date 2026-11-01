#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (contrato §1.6 · BLD1025K). Sin red, sin uvx, sin tocar configuraciones reales."""
import json, os, shutil, stat, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import puente_mcp as P

class Falso:
    """Sistema simulado: devuelve la salida dada y apunta las órdenes (nunca ejecuta nada)."""
    def __init__(self, salida="", codigo=0, plataforma="Linux"):
        self.salida, self.codigo, self.plataforma, self.ordenes = salida, codigo, plataforma, []
    def ejecutar(self, orden, **kwargs):
        self.ordenes.append(list(orden))
        return type("R", (), {"stdout": self.salida, "returncode": self.codigo})()

CABECERA = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\n"
LSOF_LOCAL = "Blender 42 alex 5u IPv4 0x1 0t0 TCP 127.0.0.1:9876 (LISTEN)\n"
LSOF_TODOS = "Blender 42 alex 5u IPv4 0x1 0t0 TCP *:9876 (LISTEN)\n"
LSOF_CERO = "Blender 42 alex 5u IPv4 0x1 0t0 TCP 0.0.0.0:9876 (LISTEN)\n"
SS_LOCAL = CABECERA + "LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n"
SS_TODOS = CABECERA + "LISTEN 0 128 *:9876 *:*\n"
SS_CERO = CABECERA + "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*\n"
SS_OTRO = CABECERA + "LISTEN 0 128 127.0.0.1:8787 0.0.0.0:*\n"

class SegurosTest(unittest.TestCase):
    def test_la_telemetria_no_se_puede_encender(self):
        entorno = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0", "HOST": "0.0.0.0"})
        self.assertEqual((entorno["DISABLE_TELEMETRY"], entorno["BLENDER_MCP_SAFE_MODE"], entorno["BLENDER_MCP_HOST"]),
                         ("true", "1", "127.0.0.1"))
        self.assertNotIn("HOST", entorno)

    def test_no_lleva_claves_ni_host_abierto(self):
        entorno = P.seguros_de({"OPENROUTER_API_KEY": "no-debe-pasar", "PATH": "/usr/bin:/bin"})
        self.assertNotIn("OPENROUTER_API_KEY", entorno)
        self.assertEqual(entorno["PATH"], "/usr/bin:/bin")

class HerramientasTest(unittest.TestCase):
    def test_solo_deja_las_de_lectura(self):
        entrada = ["look", "execute_blender_code", "get_scene_info", "generate_3d", "inventada", "get_addon_status",
                   "disable_telemetry", "search_assets", "import_asset", "record_trajectory_feedback"]
        self.assertEqual(P.herramientas_para_agentes(entrada), ["look", "get_scene_info", "get_addon_status"])

    def test_acepta_diccionarios_y_no_duplica(self):
        entrada = [{"name": "get_scene_info"}, {"name": "execute_blender_code"}, {"name": "look"}, {"name": "look"}]
        self.assertEqual(P.herramientas_para_agentes(entrada), ["get_scene_info", "look"])

class PuertoTest(unittest.TestCase):
    def _vale(self, salida, plataforma="Linux", codigo=0):
        sistema = Falso(salida, codigo, plataforma)
        ok, motivo = P.puerto_solo_local(sistema)
        self.assertTrue(motivo)
        return ok

    def test_local_es_ok_en_las_dos_plataformas(self):
        for salida, plataforma in ((SS_LOCAL, "Linux"), (LSOF_LOCAL, "Darwin")):
            self.assertTrue(self._vale(salida, plataforma), plataforma)

    def test_comodin_y_todas_las_interfaces_no_valen(self):
        for salida, plataforma in ((SS_TODOS, "Linux"), (SS_CERO, "Linux"), (LSOF_TODOS, "Darwin"), (LSOF_CERO, "Darwin")):
            self.assertFalse(self._vale(salida, plataforma), salida)

    def test_sin_escucha_no_vale(self):
        for salida, plataforma, codigo in ((CABECERA, "Linux", 0), ("", "Darwin", 1), (SS_OTRO, "Linux", 0)):
            self.assertFalse(self._vale(salida, plataforma, codigo), salida)

class PlanTest(unittest.TestCase):
    def test_plan_explicado_con_tres_seguros_y_avisos(self):
        sistema = Falso(SS_LOCAL)
        plan = P.plan_puente(sistema)
        self.assertEqual(plan["entorno"], P.SEGUROS)
        self.assertEqual(plan["puerto"], 9876)
        self.assertEqual(plan["herramientas_permitidas"], ["get_scene_info", "look", "get_addon_status"])
        self.assertIn("execute_blender_code", plan["herramientas_retiradas"])
        cliente = plan["configuracion"]["mcpServers"]["blender"]
        self.assertEqual(cliente["command"], "uvx")
        self.assertEqual(cliente["env"], P.SEGUROS)
        avisos = " ".join(plan["avisos"]).lower()
        for palabra in ("mit", "hunyuan3d", "unión europea", "telemetría"):
            self.assertIn(palabra, avisos)
        pasos = " ".join(plan["pasos"]).lower()
        for palabra in ("complemento", "uvx", "127.0.0.1"):
            self.assertIn(palabra, pasos)
        self.assertEqual(sistema.ordenes, [])

class CandidatoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="starseed_puente_")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_600_sin_llaves_ni_rutas_absolutas(self):
        destino = P.escribir_candidato(P.plan_puente(Falso(SS_LOCAL)), self.tmp)
        self.assertEqual((Path(destino).name, Path(destino).parent), ("puente-mcp.candidato.json", Path(self.tmp)))
        self.assertEqual(stat.S_IMODE(os.stat(destino).st_mode), 0o600)
        self.assertEqual(os.listdir(self.tmp), ["puente-mcp.candidato.json"])
        texto = Path(destino).read_text(encoding="utf-8")
        self.assertEqual(P._problemas(json.loads(texto)), [])
        self.assertNotIn("OPENROUTER_API_KEY", texto)

    def test_rechaza_claves_y_rutas_absolutas(self):
        for peligro in ({"env": {"OPENROUTER_API_KEY": "x"}}, {"comando": "/usr/bin/uvx"}):
            with self.subTest(peligro=peligro), self.assertRaises(ValueError):
                P.escribir_candidato(peligro, self.tmp)
        self.assertEqual(os.listdir(self.tmp), [])

    def test_ninguna_funcion_lanza_uvx_pip_ni_curl(self):
        sistema = Falso(SS_LOCAL)
        P.seguros_de({}); P.herramientas_para_agentes(["look"])
        P.escribir_candidato(P.plan_puente(sistema), self.tmp)
        self.assertEqual(sistema.ordenes, [])

    def test_el_puerto_solo_consulta_lsof_o_ss(self):
        sistema = Falso(SS_LOCAL); P.puerto_solo_local(sistema)
        orden = [str(x).lower() for x in sistema.ordenes[0]]
        self.assertIn(os.path.basename(orden[0]), ("lsof", "ss"))
        for prohibido in ("uvx", "pip", "curl"):
            self.assertNotIn(prohibido, orden)

if __name__ == "__main__":
    unittest.main()
