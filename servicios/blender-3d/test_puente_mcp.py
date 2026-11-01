#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K, contrato §1.6). Sin red, sin Blender y sin `uvx`."""
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P

CABECERA_LSOF = "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
CABECERA_SS = "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process"


def lsof(*lineas):
    return "\n".join([CABECERA_LSOF] + list(lineas))


def ss(*lineas):
    return "\n".join([CABECERA_SS] + list(lineas))


class Falso:
    """Sistema inyectable: devuelve una salida fija y apunta cada orden que se le pide."""

    def __init__(self, plataforma="Linux", salida="", rc=0):
        self.plataforma, self._salida, self._rc, self.ordenes = plataforma, salida, rc, []

    def salida(self, orden, timeout=5):
        self.ordenes.append(list(orden))
        return self._salida if self._rc == 0 else None

class SegurosTest(unittest.TestCase):
    def test_telemetria_no_se_puede_dejar_encendida(self):
        e = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0", "BLENDER_MCP_HOST": "0.0.0.0"})
        self.assertEqual(e["DISABLE_TELEMETRY"], "true")
        self.assertEqual(e["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(e["BLENDER_MCP_HOST"], "127.0.0.1")

    def test_quita_claves_y_conserva_lo_inocuo(self):
        e = P.seguros_de({"PATH": "/usr/bin:/bin", "MI_TOKEN": "valor-de-prueba", "MI_SECRETO": "valor-de-prueba"})
        self.assertEqual(e["PATH"], "/usr/bin:/bin")
        self.assertNotIn("MI_TOKEN", e)
        self.assertNotIn("MI_SECRETO", e)

    def test_herramientas_solo_lectura(self):
        todas = ["get_scene_info", "look", "get_addon_status", "execute_blender_code", "generate_3d",
                 "search_assets", "import_asset", "disable_telemetry", "record_trajectory_feedback", "otra"]
        self.assertEqual(P.herramientas_para_agentes(todas), ["get_scene_info", "look", "get_addon_status"])

    def test_herramientas_aceptan_fichas(self):
        fichas = [{"name": "look", "descripcion": "mirar"}, {"name": "execute_blender_code"}]
        self.assertEqual(P.herramientas_para_agentes(fichas), [{"name": "look", "descripcion": "mirar"}])

class PuertoTest(unittest.TestCase):
    def test_lsof_solo_local_ok(self):
        s = Falso("Darwin", lsof('Python  123  alex  5u  IPv4 0x1  0t0  TCP 127.0.0.1:9876 (LISTEN)'))
        ok, motivo = P.puerto_solo_local(s)
        self.assertTrue(ok)
        self.assertIn("127.0.0.1", motivo)
        self.assertEqual(s.ordenes[0][0], "lsof")
        self.assertIn("-sTCP:LISTEN", s.ordenes[0])

    def test_lsof_estrella_y_todo_interfaz_no(self):
        for anfitrion in ("*:9876", "0.0.0.0:9876"):
            s = Falso("Darwin", lsof("Python  123  alex  5u  IPv4 0x1  0t0  TCP %s (LISTEN)" % anfitrion))
            ok, _ = P.puerto_solo_local(s)
            self.assertFalse(ok, anfitrion)

    def test_ss_y_sin_escucha_no(self):
        linea = 'LISTEN 0 128 %s 0.0.0.0:* users:(("python",pid=1,fd=3))'
        self.assertTrue(P.puerto_solo_local(Falso("Linux", ss(linea % "127.0.0.1:9876")))[0])
        for anfitrion in ("0.0.0.0:9876", "[::1]:9876", "[::]:9876", "*:9876"):
            self.assertFalse(P.puerto_solo_local(Falso("Linux", ss(linea % anfitrion)))[0], anfitrion)
        self.assertFalse(P.puerto_solo_local(Falso("Linux", ss()))[0])
        self.assertFalse(P.puerto_solo_local(Falso("Darwin", "", rc=1))[0])


class CandidatoTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.s = Falso("Linux", ss('LISTEN 0 128 127.0.0.1:9876 0.0.0.0:* users:(("python",pid=1,fd=3))'))

    def test_plan_explica_y_no_activa_nada(self):
        plan = P.plan_puente(self.s)
        self.assertFalse(plan["estado"]["activado"])
        self.assertTrue(plan["estado"]["puerto_ok"])
        self.assertEqual(plan["configuracion_candidata"]["mcpServers"]["blender"]["env"], P.seguros_de({}))
        self.assertEqual(plan["herramientas"], ["get_scene_info", "look", "get_addon_status"])
        avisos = json.dumps(plan["avisos"], ensure_ascii=False)
        self.assertIn("MIT", avisos)
        self.assertIn("Hunyuan3D", avisos)
        self.assertIn("UE", avisos)
        self.assertTrue(all(plan["como"]))

    def test_candidato_600_sin_claves_ni_rutas(self):
        plan = P.plan_puente(self.s)
        ruta = P.escribir_candidato(plan, self.tmp.name)
        self.assertEqual(stat.S_IMODE(os.stat(ruta).st_mode), 0o600)
        texto = Path(ruta).read_text(encoding="utf-8")
        self.assertEqual(Path(ruta).name, "puente-mcp.candidato.json")
        self.assertNotRegex(texto, r"(?i)(api[_-]?key|token|secret|password)")
        self.assertNotRegex(texto, r"(?:^|[\s\"'(])/(?:Users|home|opt|private|tmp|var|etc|Applications)/")

    def test_no_ejecuta_uvx_pip_ni_curl(self):
        P.plan_puente(self.s)
        self.assertTrue(self.s.ordenes)
        for orden in self.s.ordenes:
            self.assertIn(orden[0], ("lsof", "ss"))
            self.assertFalse({"uvx", "pip", "curl"} & set(orden))


if __name__ == "__main__":
    unittest.main()
