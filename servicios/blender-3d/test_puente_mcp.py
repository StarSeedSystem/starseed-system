#!/usr/bin/env python3
"""Pruebas del puente MCP opcional (BLD1025K). No se ejecuta Blender ni las órdenes que el plan nombra."""
import json, re, stat, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "taller-3d")); sys.path.insert(1, str(Path(__file__).resolve().parent))
import puente_mcp as P
import taller as T

SS_OK = "State Recv-Q Send-Q Local Address:Port Peer Address:Port\nLISTEN 0 128 127.0.0.1:9876 0.0.0.0:* users:(())\n"


class FalsoDatos:
    """Ejecutable simulado: registra cada orden y devuelve la salida fijada (nunca la real)."""

    def __init__(self, salida=SS_OK):
        self.salida = salida
        self.ordenes = []

    def __call__(self, orden, **_kw):
        self.ordenes.append(list(orden))
        return SimpleNamespace(returncode=0, stdout=self.salida)


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.addCleanup(self.tmp.cleanup)

    def sistema(self, falso, plataforma="Linux"):
        return T.Sistema(raiz=self.raiz, ejecutar=falso, plataforma=plataforma, entorno={"HOME": str(self.raiz)})


class SegurosTest(Base):
    def test_seguros_apagan_telemetria_siempre(self):
        sal = P.seguros_de({"DISABLE_TELEMETRY": "false", "BLENDER_MCP_SAFE_MODE": "0",
                            "BLENDER_MCP_HOST": "0.0.0.0", "PATH": "/usr/bin"})
        self.assertEqual((sal["DISABLE_TELEMETRY"], sal["BLENDER_MCP_SAFE_MODE"], sal["BLENDER_MCP_HOST"], sal["PATH"]),
                         ("true", "1", "127.0.0.1", "/usr/bin"))
        for h in ("localhost", "*", ""):
            self.assertEqual(P.seguros_de({"BLENDER_MCP_HOST": h})["BLENDER_MCP_HOST"], "127.0.0.1")

    def test_herramientas_para_agentes_solo_lectura(self):
        todas = ["execute_blender_code", "get_scene_info", "look", "generate_3d", "search_assets",
                 "import_asset", "get_addon_status", "disable_telemetry",
                 "record_trajectory_feedback", "herramienta_que_no_conocemos"]
        self.assertEqual(P.herramientas_para_agentes(todas), ["get_scene_info", "look", "get_addon_status"])
        self.assertEqual((P.herramientas_para_agentes(["execute_blender_code"]), P.herramientas_para_agentes(None)),
                         ([], []))


class PuertoTest(Base):
    def _caso(self, salida, plataforma="Linux"):
        falso = FalsoDatos(salida)
        resultado = P.puerto_solo_local(self.sistema(falso, plataforma))
        return resultado, falso.ordenes

    def test_ss_solo_127_ok(self):
        (ok, motivo), ordenes = self._caso(SS_OK)
        self.assertEqual((ok, ordenes[0]), (True, ["ss", "-ltn"]))   # lista de argumentos, nunca shell
        self.assertIn("127.0.0.1", motivo)

    def test_escuchas_fuera_del_bucle_no(self):
        for salida in ("LISTEN 0 128 *:9876 0.0.0.0:*", "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*",
                       "LISTEN 0 128 [::]:9876 [::]:*"):
            with self.subTest(escucha=salida):
                self.assertFalse(self._caso(salida)[0][0])

    def test_ss_sin_escucha_no(self):
        (ok, motivo), _ordenes = self._caso("")
        self.assertFalse(ok)
        self.assertIn("no está en escucha", motivo)

    def test_lsof_macos_ok(self):
        lsof = "python  123 alex   4u  IPv4  tcp  TCP 127.0.0.1:9876 (LISTEN)"
        (ok, motivo), ordenes = self._caso(lsof, plataforma="Darwin")
        self.assertEqual((ok, ordenes[0]), (True, ["lsof", "-nP", "-iTCP:9876", "-sTCP:LISTEN"]))
        self.assertIn("127.0.0.1", motivo)


class CandidatoTest(Base):
    def test_candidato_permisos_600_y_sin_claves_ni_rutas(self):
        plan = P.plan_puente(self.sistema(FalsoDatos()))
        ruta = P.escribir_candidato(plan, self.raiz)
        self.assertEqual((ruta.name, stat.S_IMODE(ruta.stat().st_mode)), ("puente-mcp.candidato.json", 0o600))
        texto = json.dumps(json.loads(ruta.read_text(encoding="utf-8")), ensure_ascii=False)
        self.assertNotIn(str(self.raiz), texto)                      # sin rutas absolutas
        self.assertFalse(re.search(r"/Users/|/home/|/tmp/", texto))
        self.assertFalse(re.search(r"\b[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z_]*\b", texto))
        datos = json.loads(ruta.read_text(encoding="utf-8")); env = datos["candidato_para_cliente_mcp"]["env"]
        self.assertEqual((datos["candidato_para_cliente_mcp"]["command"], datos["herramientas_para_agentes"],
                          (env["DISABLE_TELEMETRY"], env["BLENDER_MCP_SAFE_MODE"]), env["BLENDER_MCP_HOST"]),
                         ("uvx", list(P.LECTURA), ("true", "1"), "127.0.0.1"))

    def test_plan_explica_y_avisos(self):
        plan = P.plan_puente(self.sistema(FalsoDatos()))
        texto = json.dumps(plan, ensure_ascii=False)
        self.assertTrue(plan["comprobacion_puerto"]["ok"])
        for c in ("Hunyuan3D", "MIT", "execute_blender_code"):
            self.assertIn(c, texto)
        self.assertEqual(P.herramientas_para_agentes(plan["herramientas_para_agentes"]), list(P.LECTURA))


class SinEjecucionTest(Base):
    def test_nadie_ejecuta_uvx_pip_curl(self):
        falso = FalsoDatos()
        s = self.sistema(falso)
        P.puerto_solo_local(s)
        plan = P.plan_puente(s)
        P.herramientas_para_agentes(list(plan["herramientas_para_agentes"]) + ["execute_blender_code"])
        P.escribir_candidato(plan, self.raiz)
        for orden in falso.ordenes:
            self.assertIsInstance(orden, list)            # siempre lista de argumentos, nunca shell
            self.assertIn(orden[0], ("lsof", "ss"))       # lo único externo que llega a ejecutarse


if __name__ == "__main__":
    unittest.main()
