#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ACC1121: la puerta común de la dirección — lista cerrada, validación, registro y resultado.

Cada orden se prueba con un doble que solo recibe los argumentos ya validados; al final se
hace una llamada REAL e inocua (`buscar_capacidad` en seco, sin medios ni Mac) para comprobar
que la orden de verdad llama a la herramienta existente y devuelve su resumen.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

DIR = Path(__file__).resolve().parent
if str(DIR) not in sys.path:
    sys.path.insert(0, str(DIR))

import mcp_director_ordenes as O  # noqa: E402


class PruebasOrdenes(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._guardada = os.environ.get("STARSEED_ROOT")
        os.environ["STARSEED_ROOT"] = self.tmp.name
        self.llamadas = {}
        self.dobles = {nombre: self._doble(nombre) for nombre in O.ORDENES}

    def tearDown(self):
        if self._guardada is None:
            os.environ.pop("STARSEED_ROOT", None)
        else:
            os.environ["STARSEED_ROOT"] = self._guardada
        self.tmp.cleanup()

    def _doble(self, nombre):
        def f(argumentos, quien, motivo):
            self.llamadas[nombre] = (argumentos, quien, motivo)
            return "hecho:%s" % nombre
        return f

    def _ejecutar(self, orden, argumentos=None, **extra):
        return O.ejecutar(orden, argumentos, "claude", "prueba", herramientas=self.dobles, **extra)

    def test_lista_cerrada_y_reservadas(self):
        self.assertEqual(len(O.ORDENES), 13)
        self.assertEqual(len(set(O.ORDENES)), 13)
        self.assertIn("encargar_tarea", O.ORDENES)
        self.assertIn("publicar_fuera_de_puertas", O.RESERVADAS)
        with self.assertRaises(ValueError):
            O.validar("rm -rf /", {})

    def test_orden_por_orden_con_dobles(self):
        tarea = {"id": "ACC1121B", "titulo": "prueba", "archivos": ["scripts/puente/a.py"],
                 "depende": [], "prompt": "Escribe un módulo puro pequeño y con pruebas."}
        casos = {
            "priorizar_tarea": {"tarea": "ACC1121B", "prioridad": 5},
            "reabrir_tarea": {"tarea": "ACC1121B"},
            "encargar_tarea": {"ola": "prueba", "tarea": tarea},
            "lanzar_cola": {"cola": "prueba", "trabajadores": 2},
            "pausar_enjambre": {},
            "reanudar_enjambre": {},
            "buscar_capacidad": {"aplicar": False},
            "lanzar_nube": {"runs": 1, "trabajadores": 3, "cesion": True},
            "compilar_prueba": {"nota": "solo comprobar"},
            "escalar_tarea": {"tarea": "ACC1121B", "motor": "sonnet"},
            "archivar_worktrees": {"aplicar": False},
            "apuntar_nota": {"texto": "nota de prueba", "canal": "mando"},
            "apuntar_relevo": {"texto": "relevo de prueba", "canal": "mando"},
        }
        for nombre, argumentos in casos.items():
            with self.subTest(orden=nombre):
                self.assertEqual(self._ejecutar(nombre, argumentos), "hecho:%s" % nombre)
                self.assertIn(nombre, self.llamadas)

    def test_validaciones_que_fallan(self):
        with self.assertRaises(ValueError):
            O.validar("encargar_tarea", {"ola": "x", "tarea": {
                "id": "ACC1121B", "archivos": ["a", "b", "c", "d"],
                "prompt": "Escribe un módulo puro pequeño y con pruebas."}})
        with self.assertRaises(ValueError):
            O.validar("encargar_tarea", {"ola": "x", "tarea": {
                "id": "ACC1121B", "archivos": ["a"], "prompt": "corto"}})
        with self.assertRaises(ValueError):
            O.validar("encargar_tarea", {"ola": "x", "tarea": {
                "id": "mal id", "archivos": ["a"],
                "prompt": "Escribe un módulo puro pequeño y con pruebas."}})
        with self.assertRaises(ValueError):
            O.validar("lanzar_nube", {"runs": 1, "trabajadores": 3})
        with self.assertRaises(ValueError):
            O.validar("compilar_prueba", {"sha": "no-es-un-sha"})
        with self.assertRaises(ValueError):
            O.ejecutar("priorizar_tarea", {"tarea": "ACC1121B", "prioridad": 1},
                       "", "prueba", herramientas=self.dobles)

    def test_reservadas_contestan_esto_es_de_alex(self):
        for nombre, motivo in O.RESERVADAS.items():
            with self.subTest(orden=nombre):
                texto = self._ejecutar(nombre, {})
                self.assertEqual(texto, "esto es de Alex: %s" % motivo)
                self.assertNotIn(nombre, self.llamadas)

    def test_registro_jsonl_con_quien_canal_medio_orden_y_resultado(self):
        self._ejecutar("pausar_enjambre", {}, canal="telegram", medio="mac")
        ruta = Path(self.tmp.name) / "starseed_memory_root" / "mando" / "ordenes-direccion.jsonl"
        fila = json.loads(ruta.read_text(encoding="utf-8").splitlines()[-1])
        self.assertEqual(fila["quien"], "claude")
        self.assertEqual(fila["canal"], "telegram")
        self.assertEqual(fila["medio"], "mac")
        self.assertEqual(fila["orden"], "pausar_enjambre")
        self.assertEqual(fila["resultado"], "hecho:pausar_enjambre")

    def test_encargar_tarea_real_crea_la_cola_validada(self):
        tarea = {"id": "ACC1121C", "titulo": "prueba real",
                 "archivos": ["scripts/puente/a.py"], "depende": [],
                 "prompt": "Escribe un módulo puro pequeño y con sus pruebas."}
        texto = O.ejecutar("encargar_tarea", {"ola": "prueba", "tarea": tarea},
                           "claude", "prueba real")
        ruta = Path(self.tmp.name) / "starseed_memory_root" / "olas" / "cola-prueba.json"
        self.assertIn("encargada", texto)
        self.assertEqual(json.loads(ruta.read_text(encoding="utf-8"))[0]["id"], "ACC1121C")
        with self.assertRaises(ValueError):
            O.ejecutar("encargar_tarea", {"ola": "prueba", "tarea": tarea},
                       "claude", "id repetido")

    def test_mcp_expone_la_puerta_y_reservadas(self):
        import mcp_director
        listado = mcp_director.atender({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        self.assertIn("metagenesis_orden", [t["name"] for t in listado["result"]["tools"]])
        respuesta = mcp_director.atender({
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": "metagenesis_orden", "arguments": {
                "orden": "cerrar_apps", "argumentos": {}, "quien": "claude", "motivo": "prueba"}}})
        self.assertIn("esto es de Alex", respuesta["result"]["content"][0]["text"])

    def test_la_puerta_del_presidente_incluye_la_orden(self):
        import motores_director as M
        permitidas, vetadas = M.permisos_del_presidente()
        self.assertIn("mcp__starseed-director__metagenesis_orden", permitidas)
        self.assertIn("metagenesis_orden", M.ficha_permisos())
        self.assertNotIn("mcp__starseed-director__produccion_reanudar", permitidas)
        self.assertIn("mcp__starseed-director__produccion_reanudar", vetadas)

    def test_buscar_capacidad_real_en_seco(self):
        import buscar_capacidad as B
        B.ESTADO = str(Path(self.tmp.name) / "buscar-capacidad.json")
        B.CANDADO = str(Path(self.tmp.name) / "buscar-capacidad.lock")
        B.SALUD = str(Path(self.tmp.name) / "salud-proveedores.json")
        texto = O.ejecutar(
            "buscar_capacidad", {"aplicar": False, "sin_medios": True, "sin_mac": True},
            "claude", "prueba real en seco")
        self.assertIsInstance(texto, str)
        self.assertTrue(texto.strip())


if __name__ == "__main__":
    unittest.main()
