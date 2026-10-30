#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional de Blender (BLD1025K)."""
import json, stat, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P  # noqa: E402

class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""

class Falso:
    def __init__(self, salida="", falla=False):
        self.salida_txt, self.falla, self.ordenes = salida, falla, []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if self.falla:
            raise OSError("no existe")
        return Res(0, self.salida_txt)

def sistema(salida="", plataforma="Linux", falla=False):
    f = Falso(salida, falla)
    return P.Sistema(plataforma=plataforma, ejecutar=f), f

LSOF_LOCAL = "Blender 1 alex 10u IPv4 0x1 0t0 TCP 127.0.0.1:9876 (LISTEN)\n"
LSOF_ABIERTO = "Blender 1 alex 10u IPv4 0x1 0t0 TCP *:9876 (LISTEN)\n"
SS_LOCAL = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n"
SS_ABIERTO = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 128 0.0.0.0:9876 0.0.0.0:*\n"

class Seguros(unittest.TestCase):
    def test_no_se_puede_encender_la_telemetria_ni_el_modo_peligroso(self):
        e = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0"})
        self.assertEqual(e["DISABLE_TELEMETRY"], "true")
        self.assertEqual(e["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertEqual(e["BLENDER_MCP_HOST"], "127.0.0.1")
        self.assertEqual(e["BLENDER_MCP_PORT"], "9876")

    def test_herramientas_solo_lectura(self):
        todas = ["get_scene_info", "look", "get_addon_status", "execute_blender_code",
                 "generate_3d", "search_assets", "import_asset", "disable_telemetry",
                 "record_trajectory_feedback", "inventada"]
        self.assertEqual(P.herramientas_para_agentes(todas),
                         ["get_scene_info", "look", "get_addon_status"])
        self.assertNotIn("execute_blender_code", P.herramientas_para_agentes(todas))
        self.assertEqual(P.herramientas_para_agentes([]), [])
        self.assertEqual(P.herramientas_para_agentes([{"name": "look"}, {"name": "execute_blender_code"}]),
                         [{"name": "look"}])

class Puerto(unittest.TestCase):
    def test_lsof_solo_local(self):
        s, f = sistema(LSOF_LOCAL, "Darwin")
        self.assertEqual(P.puerto_solo_local(s), (True, "escucha solo en 127.0.0.1:9876"))
        self.assertEqual(f.ordenes[0][:2], ["lsof", "-nP"])

    def test_lsof_en_todas_las_interfaces(self):
        s, _ = sistema(LSOF_ABIERTO, "Darwin")
        ok, motivo = P.puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("*", motivo)

    def test_ss_solo_local(self):
        s, f = sistema(SS_LOCAL, "Linux")
        self.assertTrue(P.puerto_solo_local(s)[0])
        self.assertEqual(f.ordenes, [["ss", "-ltn"]])

    def test_ss_en_0000(self):
        s, _ = sistema(SS_ABIERTO, "Linux")
        ok, motivo = P.puerto_solo_local(s)
        self.assertFalse(ok)
        self.assertIn("0.0.0.0", motivo)

    def test_sin_escucha_o_orden_que_falla(self):
        for salida, falla, motivo in (("", False, "no escucha"), ("", True, "no se pudo comprobar")):
            with self.subTest(falla=falla):
                s, _ = sistema(salida, "Linux", falla)
                ok, texto = P.puerto_solo_local(s)
                self.assertFalse(ok)
                self.assertIn(motivo, texto)

class Candidato(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.raiz = Path(self.tmp.name)

    def test_candidato_600_sin_claves_ni_rutas_absolutas(self):
        s, f = sistema(SS_LOCAL, "Linux")
        plan = P.plan_puente(s)
        ruta = P.escribir_candidato(plan, self.raiz)
        self.assertEqual(ruta.name, "puente-mcp.candidato.json")
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        texto = ruta.read_text(encoding="utf-8")
        datos = json.loads(texto)
        self.assertTrue(datos["puerto"]["comprobado"])
        self.assertFalse(datos["toca_configuracion_real"])
        self.assertIn("MIT", texto)
        self.assertIn("Hunyuan3D", texto)
        self.assertNotIn("/Users/", texto); self.assertNotIn("/home/", texto)
        for clave in ("API_KEY", "TOKEN", "SECRET"):
            self.assertNotIn(clave, texto)
        self.assertTrue(all(orden[0] in ("ss", "lsof") for orden in f.ordenes))

    def test_plan_avisa_cuando_el_puerto_esta_abierto(self):
        s, _ = sistema(SS_ABIERTO, "Linux")
        plan = P.plan_puente(s)
        self.assertFalse(plan["puerto"]["comprobado"])
        self.assertIn("fuera de 127.0.0.1", plan["puerto"]["motivo"])

    def test_nadie_ejecuta_uvx_pip_ni_curl(self):
        s, f = sistema(SS_LOCAL, "Linux")
        P.escribir_candidato(P.plan_puente(s), self.raiz)
        prohibidos = ("uvx", "pip", "curl")
        self.assertFalse([o for o in f.ordenes if any(p in o[0] for p in prohibidos)])

if __name__ == "__main__":
    unittest.main()
