#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K · `architecture/blender-3d.md` §1.6)."""
import stat, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P  # noqa: E402

LSOF_LOCAL = "Blender 1 alex 3u IPv4 0 0t0 TCP 127.0.0.1:9876 (LISTEN)\n"
LSOF_ESTRELLA = "Blender 1 alex 3u IPv4 0 0t0 TCP *:9876 (LISTEN)\n"
CABECERA_SS = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\n"
SS_LOCAL = CABECERA_SS + "LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n"
SS_ESTRELLA = CABECERA_SS + "LISTEN 0 128 *:9876 *:*\n"
SS_CERO = CABECERA_SS + "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*\n"
SS_SIN = CABECERA_SS + "LISTEN 0 128 127.0.0.1:9999 0.0.0.0:*\n"

class Falso:
    def __init__(self, salida=""):
        self.salida_texto = salida
        self.ordenes = []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        return SimpleNamespace(returncode=0, stdout=self.salida_texto, stderr="")

def sistema(plataforma, salida):
    falso = Falso(salida)
    return P.Sistema(plataforma=plataforma, ejecutar=falso, entorno={}), falso


class SegurosTest(unittest.TestCase):
    def test_telemetria_no_se_puede_dejar_encendida(self):
        entorno = P.seguros_de({
            "DISABLE_TELEMETRY": "false",
            "disable_telemetry": "false",
            "BLENDER_MCP_SAFE_MODE": "0",
            "BLENDER_MCP_HOST": "0.0.0.0",
            "OPENAI_API_KEY": "sk-de-ejemplo",
        })
        self.assertEqual(entorno["DISABLE_TELEMETRY"], "true")
        self.assertEqual(entorno["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(entorno["BLENDER_MCP_HOST"], "127.0.0.1")
        self.assertNotIn("OPENAI_API_KEY", entorno)

    def test_solo_herramientas_de_lectura(self):
        entrada = ["execute_blender_code", "get_scene_info", "look", "generate_3d",
                   "search_assets", "import_asset", "get_addon_status", "disable_telemetry",
                   "record_trajectory_feedback", "herramienta_inventada", "", None]
        self.assertEqual(P.herramientas_para_agentes(entrada),
                         ["get_scene_info", "look", "get_addon_status"])


class PuertoTest(unittest.TestCase):
    def test_lsof_local_ok(self):
        s, _ = sistema("Darwin", LSOF_LOCAL)
        ok, motivo = P.puerto_solo_local(s)
        self.assertTrue(ok, motivo)

    def test_lsof_estrella_no(self):
        s, _ = sistema("Darwin", LSOF_ESTRELLA)
        ok, motivo = P.puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("*", motivo)

    def test_ss_local_ok(self):
        s, _ = sistema("Linux", SS_LOCAL)
        ok, motivo = P.puerto_solo_local(s)
        self.assertTrue(ok, motivo)

    def test_ss_estrella_y_cero_no(self):
        for salida in (SS_ESTRELLA, SS_CERO):
            with self.subTest(salida=salida):
                s, _ = sistema("Linux", salida)
                ok, _ = P.puerto_solo_local(s)
                self.assertFalse(ok)

    def test_sin_escucha_no(self):
        s, _ = sistema("Linux", SS_SIN)
        ok, motivo = P.puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("no escucha", motivo)


class CandidatoTest(unittest.TestCase):
    def test_permisos_600_sin_claves_ni_rutas(self):
        plan = {
            "titulo": "Puente MCP opcional de Blender",
            "entorno": P.seguros_de({}),
            "configuracion": {"mcpServers": {"blender": {
                "command": "uvx", "args": ["mcp-for-blender"],
                "env": {"OPENAI_API_KEY": "sk-de-ejemplo"},
            }}},
            "ruta_interna": "/Users/alex/privado/archivo.txt",
        }
        with tempfile.TemporaryDirectory() as tmp:
            ruta = P.escribir_candidato(plan, tmp)
            assert ruta is not None
            self.assertTrue(ruta.exists())
            self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
            texto = ruta.read_text(encoding="utf-8")
        self.assertNotIn("OPENAI_API_KEY", texto)
        self.assertNotIn("sk-de-ejemplo", texto)
        self.assertNotIn("/Users/alex", texto)
        self.assertIn("127.0.0.1", texto)

    def test_no_ejecuta_instaladores(self):
        s, falso = sistema("Linux", SS_LOCAL)
        P.puerto_solo_local(s)
        plan = P.plan_puente(s)
        with tempfile.TemporaryDirectory() as tmp:
            P.escribir_candidato(plan, tmp)
        nombres = [Path(orden[0]).name for orden in falso.ordenes]
        self.assertEqual(nombres, ["ss"])
        self.assertFalse(set(nombres) & {"uvx", "pip", "pip3", "curl"})


if __name__ == "__main__":
    unittest.main()
