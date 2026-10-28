#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K). Sin red, sin claves y sin abrir puertos."""
import json, stat, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P

class Res:
    def __init__(self, rc=0, out=""):
        self.returncode, self.stdout, self.stderr = rc, out, ""

class Falsa:
    """Sistema simulado: registra las órdenes y devuelve una salida fija."""
    def __init__(self, out="", rc=0, plataforma="Linux", falla=False):
        self.out, self.rc, self.plataforma, self.falla = out, rc, plataforma, falla
        self.ordenes = []
    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if self.falla:
            raise OSError("orden inexistente")
        return Res(self.rc, self.out)
    def sistema(self, raiz):
        return P.Sistema(ejecutar=self, plataforma=self.plataforma, entorno={}, raiz=raiz)

class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)
    def puerto(self, out, plataforma="Linux", rc=0, falla=False):
        f = Falsa(out=out, rc=rc, plataforma=plataforma, falla=falla)
        return P.puerto_solo_local(f.sistema(self.raiz)), f

class SegurosTest(unittest.TestCase):
    def test_telemetria_no_se_puede_dejar_encendida(self):
        original = {"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0",
                    "BLENDER_MCP_HOST": "0.0.0.0", "MCP_HOST": "0.0.0.0"}
        seguros = P.seguros_de(original)
        self.assertEqual((seguros["DISABLE_TELEMETRY"], seguros["BLENDER_MCP_SAFE_MODE"]), ("true", "1"))
        self.assertEqual((seguros["BLENDER_MCP_HOST"], seguros["MCP_HOST"]), ("127.0.0.1", "127.0.0.1"))
        self.assertEqual(original["DISABLE_TELEMETRY"], "false")
        self.assertEqual(P.seguros_de({"PATH": "/bin"})["PATH"], "/bin")

class HerramientasTest(unittest.TestCase):
    def test_solo_lectura_y_sin_desconocidas(self):
        pedidas = ["execute_blender_code", "generate_3d", "search_assets", "import_asset",
                   "disable_telemetry", "record_trajectory_feedback", "look", "inventada",
                   "get_scene_info", "get_addon_status", "look"]
        self.assertEqual(P.herramientas_para_agentes(pedidas),
                         ["look", "get_scene_info", "get_addon_status"])
        self.assertEqual(P.herramientas_para_agentes(None), [])
        self.assertEqual(P.herramientas_para_agentes({"look": True}), [])

class PuertoTest(Base):
    def test_lsof(self):
        (ok, motivo), f = self.puerto(
            "Blender 1 alex 4u IPv4 0x0 0t0 TCP 127.0.0.1:9876 (LISTEN)\n", "Darwin")
        self.assertTrue(ok)
        self.assertIn("127.0.0.1", motivo)
        self.assertEqual(f.ordenes[0], ["lsof", "-nP", "-iTCP:9876", "-sTCP:LISTEN"])
        for salida in ("Blender 1 alex 4u IPv4 0x0 0t0 TCP *:9876 (LISTEN)\n",
                       "Blender 1 alex 4u IPv6 0x0 0t0 TCP 0.0.0.0:9876 (LISTEN)\n"):
            self.assertFalse(self.puerto(salida, "Darwin")[0][0])
    def test_ss(self):
        cabecera = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\n"
        self.assertTrue(self.puerto(cabecera + "LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n")[0][0])
        for salida in ("LISTEN 0 128 *:9876 0.0.0.0:*\n", "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*\n"):
            self.assertFalse(self.puerto(salida)[0][0])
        self.assertEqual(self.puerto("")[1].ordenes[0], ["ss", "-ltn"])
    def test_sin_escucha_o_sin_orden(self):
        self.assertFalse(self.puerto("", rc=1)[0][0])
        ok, motivo = self.puerto("", falla=True)[0]
        self.assertFalse(ok)
        self.assertIn("no se pudo", motivo)

class PlanTest(Base):
    def test_explica_y_no_ejecuta(self):
        f = Falsa()
        plan = P.plan_puente(f.sistema(self.raiz))
        self.assertEqual(f.ordenes, [])
        texto = json.dumps(plan, ensure_ascii=False)
        for trozo in ("uvx", "MIT", "Hunyuan3D", "UE", "DISABLE_TELEMETRY", "127.0.0.1", "aprobacion"):
            self.assertIn(trozo, texto)
        env = plan["configuracion_cliente"]["mcpServers"]["blender"]["env"]
        self.assertEqual(env["DISABLE_TELEMETRY"], "true")
        self.assertEqual(plan["herramientas_permitidas"], list(P.LECTURA))
        self.assertNotIn("execute_blender_code", plan["herramientas_permitidas"])
        self.assertNotIn(str(self.raiz), texto)
        self.assertNotIn(str(Path.home()), texto)

class CandidatoTest(Base):
    def test_permisos_600_y_sin_tocar_config_real(self):
        f = Falsa()
        real = self.raiz / ".config" / "claude" / "claude_desktop_config.json"
        real.parent.mkdir(parents=True)
        real.write_text('{"no_tocar": true}', encoding="utf-8")
        ruta = P.escribir_candidato(P.plan_puente(f.sistema(self.raiz)), self.raiz)
        self.assertEqual(ruta, self.raiz / ".starseed" / "blender-3d" / "puente-mcp.candidato.json")
        self.assertTrue(ruta.exists())
        self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
        self.assertEqual(real.read_text(encoding="utf-8"), '{"no_tocar": true}')
        texto = ruta.read_text(encoding="utf-8")
        self.assertEqual(json.loads(texto)["v"], 1)
        self.assertNotIn(str(self.raiz), texto)
        for prohibido in ("KEY=", "TOKEN=", "SECRET="):
            self.assertNotIn(prohibido, texto.upper())
        self.assertEqual(f.ordenes, [])
    def test_ninguna_funcion_ejecuta_uvx_pip_curl(self):
        f = Falsa(out="LISTEN 0 128 127.0.0.1:9876 0.0.0.0:*\n")
        s = f.sistema(self.raiz)
        P.puerto_solo_local(s)
        P.escribir_candidato(P.plan_puente(s), self.raiz)
        for orden in f.ordenes:
            for prohibida in ("uvx", "pip", "curl"):
                self.assertNotIn(prohibida, orden)
        self.assertTrue(all(o[0] in ("ss", "lsof") for o in f.ordenes))
