#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del puente MCP opcional (BLD1025K). Nada de verdad se ejecuta aquí: todo simulado."""
import json, re, stat, sys, tempfile, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import puente_mcp as P


class Falso:
    """Sistema simulado: graba la orden y enseña la salida preparada; no ejecuta nada."""
    PROHIBIDOS = {"uvx", "pip", "curl"}

    def __init__(self, plataforma="Darwin", salida=""):
        self.plataforma, self.salida, self.ordenes = plataforma, salida, []

    def __call__(self, orden, **kw):
        self.ordenes.append(list(orden))
        if orden and orden[0] in self.PROHIBIDOS:
            raise AssertionError("prohibido ejecutar %s en las pruebas" % orden[0])
        return type("Res", (), {"returncode": 0, "stdout": self.salida, "stderr": ""})()


def sistema(plataforma="Darwin", salida=""):
    falso = Falso(plataforma, salida)
    return P.Sistema(plataforma=plataforma, ejecutar=falso), falso


LSOF_LOCAL = "blender 123 alex 12u IPv4 0x1 0t0 TCP 127.0.0.1:9876 (LISTEN)"
LSOF_ESTRELLA = "blender 123 alex 12u IPv4 0x1 0t0 TCP *:9876 (LISTEN)"
LSOF_CERO = "blender 123 alex 12u IPv4 0x1 0t0 TCP 0.0.0.0:9876 (LISTEN)"
SS_LOCAL = "State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port\nLISTEN 0 128 127.0.0.1:9876 0.0.0.0:*"
SS_SEIS = "LISTEN 0 128 [::]:9876 [::]:*"


class TestPuente(unittest.TestCase):
    def test_seguros_forzados(self):
        for telemetria in ("false", "0", "1"):
            ent = P.seguros_de({"DISABLE_TELEMETRY": telemetria, "PERSONAL": "solo_un_nombre"})
            self.assertEqual(ent["DISABLE_TELEMETRY"], "true")
            self.assertEqual(ent["BLENDER_MCP_SAFE_MODE"], "1")
            self.assertEqual(ent["BLENDER_MCP_HOST"], "127.0.0.1")
            self.assertEqual(ent["PERSONAL"], "solo_un_nombre")
        for vacio in (None, {}):
            ent = P.seguros_de(vacio)
            self.assertEqual(ent["DISABLE_TELEMETRY"], "true")
            self.assertEqual(ent["BLENDER_MCP_SAFE_MODE"], "1")
    def test_herramientas_solo_lectura(self):
        todas = list(P.PROHIBIDAS) + list(P.HERRAMIENTAS_LECTURA) + ["herramienta_desconocida"]
        filtradas = P.herramientas_para_agentes(todas)
        self.assertEqual(filtradas, ["get_scene_info", "look", "get_addon_status"])
        self.assertNotIn("execute_blender_code", filtradas)
        self.assertEqual(P.herramientas_para_agentes([]), [])
        self.assertEqual(P.herramientas_para_agentes(None), [])
    def test_puerto_solo_local(self):
        casos = [
            ("Darwin", LSOF_LOCAL, True), ("Darwin", LSOF_ESTRELLA + "\n" + LSOF_LOCAL, False),
            ("Darwin", LSOF_CERO, False), ("Darwin", "", False),
            ("Linux", SS_LOCAL, True), ("Linux", SS_SEIS, False),
            ("Linux", "LISTEN 0 128 0.0.0.0:9876 0.0.0.0:*", False),
            ("Linux", "State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port", False),
        ]
        for plataforma, salida, esperado in casos:
            s, falso = sistema(plataforma, salida)
            ok, motivo = P.puerto_solo_local(s)
            self.assertEqual(ok, esperado, motivo)
            self.assertEqual(falso.ordenes[0][0], "lsof" if plataforma == "Darwin" else "ss")
            if not esperado:
                self.assertTrue(motivo)
        s, falso = sistema("Darwin", LSOF_LOCAL)
        self.assertTrue(P.puerto_solo_local(s)[0])
        self.assertEqual(falso.ordenes[0][:2], ["lsof", "-nP"])
        self.assertIn("-iTCP:9876", falso.ordenes[0])
        self.assertIn("-sTCP:LISTEN", falso.ordenes[0])
    def test_plan_explicado_y_seguro(self):
        plan = P.plan_puente(sistema("Linux", SS_LOCAL)[0])
        texto = json.dumps(plan, ensure_ascii=False)
        for palabra in ("uvx", "127.0.0.1", "MIT", "Hunyuan3D", "Telemetría", "uvx mcp-for-blender"):
            self.assertIn(palabra, texto)
        self.assertGreaterEqual(len(plan["pasos"]), 4)
        self.assertEqual(plan["herramientas_para_agentes"], list(P.HERRAMIENTAS_LECTURA))
        env = plan["config_cliente"]["mcpServers"]["blender"]["env"]
        self.assertEqual(P.seguros_de(env), dict(env, **P.SEGUROS))
        self.assertEqual(env["BLENDER_MCP_SAFE_MODE"], "1")
        self.assertTrue(plan["comprobacion_socket"]["ok"])  # el falso lleva una escucha local buena
    def test_candidato_permisos_y_limpio(self):
        plan = P.plan_puente(sistema("Linux", SS_LOCAL)[0])
        with tempfile.TemporaryDirectory() as tmp:
            ruta = P.escribir_candidato(plan, raiz=tmp)
            contenido = ruta.read_text(encoding="utf-8")
            self.assertEqual(stat.S_IMODE(ruta.stat().st_mode), 0o600)
            self.assertEqual(json.loads(contenido)["version"], P.VERSION)
            self.assertFalse(re.search(r"(?i)(secret|token|api[_-]?key|password|sk-)", contenido))
            self.assertFalse(re.search(r"(?:^|[\s\"'])(?:/[A-Za-z]|~?/home|/Users|/opt|/Applications)", contenido))
    def test_candidato_no_toca_config_real(self):
        plan = P.plan_puente(sistema("Darwin", "")[0])
        with tempfile.TemporaryDirectory() as tmp:
            ajena = Path(tmp) / "claude_desktop_config.json"
            ajena.write_text('{"original": true}', encoding="utf-8")
            P.escribir_candidato(plan, raiz=tmp)
            self.assertEqual(ajena.read_text(encoding="utf-8"), '{"original": true}')
            self.assertEqual(sorted(p.name for p in Path(tmp).iterdir()),
                             ["claude_desktop_config.json", "puente-mcp.candidato.json"])
    def test_nada_instala_ni_cablea_red(self):
        s, falso = sistema("Darwin", LSOF_LOCAL)
        P.plan_puente(s)
        P.puerto_solo_local(s)
        self.assertTrue(falso.ordenes)
        for orden in falso.ordenes:
            self.assertIn(orden[0], {"lsof", "ss"})
        fuente = Path(P.__file__).read_text(encoding="utf-8")
        self.assertFalse(re.search(r"os\.system|shell=True|popen", fuente))


if __name__ == "__main__":
    unittest.main()
