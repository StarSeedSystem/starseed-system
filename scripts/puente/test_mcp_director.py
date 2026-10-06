#!/usr/bin/env python3
"""Pruebas de mcp_director.atender con carpeta temporal vía STARSEED_ROOT."""

import importlib.util
import json
import os
import select
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

_CARPETA = Path(__file__).resolve().parent
sys.path.insert(0, str(_CARPETA))

import director_chat

_espec = importlib.util.spec_from_file_location(
    "mcp_director_bajo_prueba", _CARPETA / "mcp_director.py"
)
mcp_director = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(mcp_director)


class PruebasAtender(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._guardada = os.environ.get("STARSEED_ROOT")
        os.environ["STARSEED_ROOT"] = self.tmp.name

    def tearDown(self):
        if self._guardada is None:
            os.environ.pop("STARSEED_ROOT", None)
        else:
            os.environ["STARSEED_ROOT"] = self._guardada
        self.tmp.cleanup()

    def _p(self, metodo, params=None, ident=1):
        peticion = {"jsonrpc": "2.0", "id": ident, "method": metodo}
        if params is not None:
            peticion["params"] = params
        return peticion

    def _call(self, nombre, argumentos):
        r = mcp_director.atender(
            self._p("tools/call", {"name": nombre, "arguments": argumentos})
        )
        assert "error" not in r, r.get("error")
        self.assertNotIn("isError", r["result"], r["result"])
        return r["result"]["content"][0]["text"]

    def test_initialize(self):
        r = mcp_director.atender(self._p("initialize"))
        self.assertEqual(r["jsonrpc"], "2.0")
        self.assertEqual(r["result"]["protocolVersion"], "2025-06-18")
        self.assertEqual(r["result"]["serverInfo"]["name"], "starseed-director")
        self.assertEqual(r["result"]["capabilities"], {"tools": {}})

    def test_initialize_negocia_2024_11_05(self):
        r = mcp_director.atender(
            self._p("initialize", {"protocolVersion": "2024-11-05"})
        )
        self.assertEqual(r["result"]["protocolVersion"], "2024-11-05")
        self.assertEqual(r["result"]["serverInfo"]["version"], "1.0.0")

    def test_initialize_version_desconocida_cae_en_actual(self):
        r = mcp_director.atender(
            self._p("initialize", {"protocolVersion": "1999-01-01"})
        )
        self.assertEqual(r["result"]["protocolVersion"], "2025-06-18")

    def test_notificacion_initialized_sin_respuesta(self):
        r = mcp_director.atender(
            {"jsonrpc": "2.0", "method": "notifications/initialized"}
        )
        self.assertIsNone(r)

    def test_notificacion_cancelled_sin_respuesta(self):
        r = mcp_director.atender(
            {"jsonrpc": "2.0", "method": "notifications/cancelled"}
        )
        self.assertIsNone(r)

    def test_peticion_sin_id_no_recibe_respuesta(self):
        r = mcp_director.atender({"jsonrpc": "2.0", "method": "ping"})
        self.assertIsNone(r)

    def test_ping_devuelve_result_vacio(self):
        r = mcp_director.atender(self._p("ping"))
        self.assertEqual(r, {"jsonrpc": "2.0", "id": 1, "result": {}})

    def test_tools_list_diez_herramientas(self):
        r = mcp_director.atender(self._p("tools/list"))
        nombres = [h["name"] for h in r["result"]["tools"]]
        self.assertEqual(
            nombres,
            [
                "director_leer",
                "director_decir",
                "director_bandeja",
                "director_responder",
                "produccion_estado",
                "produccion_candidatos",
                "produccion_historial",
                "produccion_vetar",
                "produccion_pausar",
                "produccion_reanudar",
            ],
        )

    def test_tools_list_esquemas_completos(self):
        r = mcp_director.atender(self._p("tools/list"))
        for herr in r["result"]["tools"]:
            esquema = herr["inputSchema"]
            with self.subTest(herramienta=herr["name"]):
                self.assertIn("properties", esquema)
                self.assertIn("required", esquema)
                self.assertEqual(esquema.get("additionalProperties"), False)
                self.assertEqual(esquema["type"], "object")

    def test_bandeja_canal_invalido_es_isError(self):
        r = mcp_director.atender(
            self._p(
                "tools/call",
                {"name": "director_bandeja", "arguments": {"canal": "mando"}},
            )
        )
        self.assertNotIn("error", r)
        self.assertTrue(r["result"]["isError"])
        self.assertIn("canal sin bandeja", r["result"]["content"][0]["text"])

    def test_herramienta_desconocida_es_error_de_parametros(self):
        r = mcp_director.atender(
            self._p("tools/call", {"name": "no_existe", "arguments": {}})
        )
        self.assertEqual(r["error"]["code"], -32602)

    def test_decir_y_leer(self):
        self.assertIn(
            "Publicado como md-",
            self._call("director_decir", {"texto": "Hola desde la prueba"}),
        )
        texto = self._call("director_leer", {"limite": 10})
        self.assertIn("Hola desde la prueba", texto)
        self.assertIn("[agente]", texto)

    def test_decir_rol_director_para_claude(self):
        self._call("director_decir", {"texto": "Informe", "de": "claude-cowork"})
        self.assertIn("[director]", self._call("director_leer", {}))

    def test_responder_marca_entrega(self):
        original = director_chat.publicar(
            "Mensaje para ide",
            de="claude-cowork",
            rol="director",
            tipo="mensaje",
            canal="mando",
            canales=["ide"],
        )
        self.assertIn(
            "Mensaje para ide", self._call("director_bandeja", {"canal": "ide"})
        )
        self.assertIn(
            "Respondido a",
            self._call(
                "director_responder",
                {
                    "id": original["id"],
                    "canal": "ide",
                    "texto": "Recibido",
                    "de": "antigravity",
                },
            ),
        )
        self.assertIn(
            "No hay pendientes", self._call("director_bandeja", {"canal": "ide"})
        )

    def test_metodo_desconocido(self):
        r = mcp_director.atender(self._p("no/existe"))
        self.assertEqual(r["error"]["code"], -32601)


class PruebasProduccion(unittest.TestCase):
    """Herramientas de producción (§9, fila MCP) con rutas temporales."""

    _VARS = (
        "STARSEED_PRODUCCION_ESTADO",
        "STARSEED_PRODUCCION_HISTORIAL",
        "STARSEED_PRODUCCION_VETOS",
        "STARSEED_PRODUCCION_PAUSA",
        "STARSEED_PRODUCCION_RAIZ",
        "STARSEED_PRODUCCION_CANDIDATOS",
    )

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = self.tmp.name
        self.rutas = {
            "STARSEED_PRODUCCION_ESTADO": os.path.join(d, "estado.json"),
            "STARSEED_PRODUCCION_HISTORIAL": os.path.join(d, "historial.jsonl"),
            "STARSEED_PRODUCCION_VETOS": os.path.join(d, "vetos", "vetos.json"),
            "STARSEED_PRODUCCION_PAUSA": os.path.join(d, "pausada.json"),
            "STARSEED_PRODUCCION_RAIZ": os.path.join(d, "repo"),
        }
        os.makedirs(self.rutas["STARSEED_PRODUCCION_RAIZ"])
        self._guardadas = {v: os.environ.get(v) for v in self._VARS}
        for v, r in self.rutas.items():
            os.environ[v] = r

    def tearDown(self):
        for v in self._VARS:
            if self._guardadas[v] is None:
                os.environ.pop(v, None)
            else:
                os.environ[v] = self._guardadas[v]
        self.tmp.cleanup()

    def _p(self, metodo, params=None, ident=1):
        peticion = {"jsonrpc": "2.0", "id": ident, "method": metodo}
        if params is not None:
            peticion["params"] = params
        return peticion

    def _call(self, nombre, argumentos):
        r = mcp_director.atender(
            self._p("tools/call", {"name": nombre, "arguments": argumentos})
        )
        assert "error" not in r, r.get("error")
        return r["result"]

    def _texto(self, nombre, argumentos):
        r = self._call(nombre, argumentos)
        self.assertNotIn("isError", r, r)
        return r["content"][0]["text"]

    def _error(self, nombre, argumentos):
        r = self._call(nombre, argumentos)
        self.assertTrue(r.get("isError"), r)
        return r["content"][0]["text"]

    def test_estado_vacio_sin_archivo(self):
        datos = json.loads(self._texto("produccion_estado", {}))
        self.assertEqual(datos["candidatos"], [])
        self.assertEqual(datos["medios"], {})
        self.assertFalse(datos["pausada"])

    def test_estado_lee_archivo_y_marca_pausa(self):
        with open(self.rutas["STARSEED_PRODUCCION_ESTADO"], "w") as f:
            json.dump({"lote": {"sha": "abc"}, "medios": {"web": "abc"}}, f)
        self._texto(
            "produccion_pausar", {"quien": "alex", "motivo": "despliegue manual"}
        )
        datos = json.loads(self._texto("produccion_estado", {}))
        self.assertEqual(datos["lote"], {"sha": "abc"})
        self.assertTrue(datos["pausada"])

    def test_pausar_escribe_quien_motivo_y_reanudar_borra(self):
        ruta = self.rutas["STARSEED_PRODUCCION_PAUSA"]
        texto = self._texto(
            "produccion_pausar", {"quien": "jev", "motivo": "riesgo alto"}
        )
        self.assertIn("pausada por jev", texto)
        with open(ruta, encoding="utf-8") as f:
            pausa = json.load(f)
        self.assertEqual(pausa["quien"], "jev")
        self.assertEqual(pausa["motivo"], "riesgo alto")
        self.assertIn("desde", pausa)
        self.assertIn(
            "reanudada por alex",
            self._texto(
                "produccion_reanudar", {"quien": "alex", "motivo": "resuelto"}
            ),
        )
        self.assertFalse(os.path.exists(ruta))
        self.assertIn(
            "no estaba pausada",
            self._texto(
                "produccion_reanudar", {"quien": "alex", "motivo": "resuelto"}
            ),
        )

    def test_escritura_exige_quien_y_motivo(self):
        for nombre in ("produccion_vetar", "produccion_pausar", "produccion_reanudar"):
            with self.subTest(herramienta=nombre):
                self.assertIn(
                    "quien y motivo son obligatorios",
                    self._error(nombre, {"clave": "abc", "quien": "", "motivo": "x"}),
                )

    def test_vetar_y_candidatos_lo_reflejan(self):
        candidatas = [
            {
                "sha": "abc123def",
                "asunto": "ola/x · integra xki2: salas",
                "tarea": "xki2",
                "archivos": [],
                "medios": [],
                "salvavidas": [],
                "veredictos": {
                    "revision": {"ok": True, "detalle": "ok"},
                    "verificacion": {"ok": True, "detalle": "ok"},
                    "diseno": {"nota": None, "toca_interfaz": False},
                },
            }
        ]
        ruta_cand = os.path.join(self.tmp.name, "candidatas.json")
        with open(ruta_cand, "w") as f:
            json.dump(candidatas, f)
        os.environ["STARSEED_PRODUCCION_CANDIDATOS"] = ruta_cand
        texto = self._texto("produccion_candidatos", {})
        self.assertIn("xki2 [abc123de] elegible", texto)
        self.assertIn(
            "Vetado abc123def",
            self._texto(
                "produccion_vetar",
                {"clave": "abc123def", "quien": "alex", "motivo": "no va"},
            ),
        )
        with open(self.rutas["STARSEED_PRODUCCION_VETOS"], encoding="utf-8") as f:
            self.assertIn("abc123def", json.load(f))
        texto = self._texto("produccion_candidatos", {})
        self.assertIn("bloqueada", texto)
        self.assertIn("vetada por alex", texto)

    def test_historial_sin_archivo_y_con_lineas(self):
        self.assertIn("Sin historial", self._texto("produccion_historial", {}))
        with open(self.rutas["STARSEED_PRODUCCION_HISTORIAL"], "w") as f:
            f.write(json.dumps({"sha": "111", "resultado": "ok"}) + "\n")
            f.write(json.dumps({"sha": "222", "resultado": "revertido"}) + "\n")
            f.write("linea rota\n")
        texto = self._texto("produccion_historial", {"limite": 2})
        self.assertNotIn("111", texto)
        self.assertIn("222", texto)
        self.assertIn("linea rota", texto)

    def test_candidatos_sin_repo_devuelve_mensaje(self):
        texto = self._texto("produccion_candidatos", {})
        self.assertIn("No hay candidatos", texto)


class PruebaProcesoReal(unittest.TestCase):
    def test_initialize_por_stdio_en_proceso_real(self):
        with tempfile.TemporaryDirectory() as tmp:
            entorno = dict(os.environ, STARSEED_ROOT=tmp)
            proc = subprocess.Popen(
                [sys.executable, str(_CARPETA / "mcp_director.py")],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=entorno,
                text=True,
            )
            try:
                peticion = {
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {"protocolVersion": "2025-03-26"},
                }
                proc.stdin.write(json.dumps(peticion) + "\n")
                proc.stdin.flush()
                listo, _, _ = select.select([proc.stdout], [], [], 5.0)
                self.assertTrue(listo, "el servidor no respondió en 5 segundos")
                linea = proc.stdout.readline()
                respuesta = json.loads(linea)
                self.assertEqual(respuesta["id"], 1)
                self.assertEqual(
                    respuesta["result"]["protocolVersion"], "2025-03-26"
                )
                self.assertEqual(
                    respuesta["result"]["serverInfo"]["version"], "1.0.0"
                )
            finally:
                proc.kill()
                proc.wait()


if __name__ == "__main__":
    unittest.main()
