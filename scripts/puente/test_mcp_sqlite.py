#!/usr/bin/env python3
"""Pruebas de mcp_sqlite y de sus herramientas en mcp_director (CAP1119)."""

import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

_CARPETA = Path(__file__).resolve().parent
sys.path.insert(0, str(_CARPETA))

import mcp_sqlite as sq

_espec = importlib.util.spec_from_file_location(
    "mcp_director_sqlite", _CARPETA / "mcp_director.py"
)
mcp_director = importlib.util.module_from_spec(_espec)
_espec.loader.exec_module(mcp_director)


class PruebasSqlite(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._raiz = os.environ.get("STARSEED_ROOT")
        self._db = os.environ.get("STARSEED_SQLITE_DB")
        os.environ["STARSEED_ROOT"] = self.tmp.name
        os.environ.pop("STARSEED_SQLITE_DB", None)
        self.ruta = sq.ruta()
        self.ruta.parent.mkdir(parents=True, exist_ok=True)
        conexion = sqlite3.connect(str(self.ruta))
        conexion.execute("CREATE TABLE tareas (id INTEGER PRIMARY KEY, titulo TEXT)")
        conexion.execute("INSERT INTO tareas (titulo) VALUES ('conectar sqlite')")
        conexion.commit()
        conexion.close()

    def tearDown(self):
        if self._raiz is None:
            os.environ.pop("STARSEED_ROOT", None)
        else:
            os.environ["STARSEED_ROOT"] = self._raiz
        if self._db is None:
            os.environ.pop("STARSEED_SQLITE_DB", None)
        else:
            os.environ["STARSEED_SQLITE_DB"] = self._db
        self.tmp.cleanup()

    def _mcp(self, nombre, argumentos):
        peticion = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": nombre, "arguments": argumentos},
        }
        return mcp_director.atender(peticion)

    def test_estado_lee_la_base_configurada(self):
        datos = json.loads(sq.estado())
        self.assertTrue(datos["existe"])
        self.assertEqual(datos["tablas"], 1)
        self.assertTrue(datos["solo_lectura"])
        self.assertIn("sqlite", datos)

    def test_estado_sin_base(self):
        os.environ["STARSEED_SQLITE_DB"] = str(Path(self.tmp.name) / "nada.sqlite3")
        datos = json.loads(sq.estado())
        self.assertFalse(datos["existe"])
        self.assertEqual(datos["tablas"], 0)

    def test_tablas_lista_con_filas(self):
        self.assertIn("tareas (1 filas)", sq.tablas())

    def test_consultar_select_devuelve_tabla(self):
        texto = sq.consultar("SELECT id, titulo FROM tareas")
        self.assertIn("id | titulo", texto)
        self.assertIn("1 | conectar sqlite", texto)

    def test_consultar_rechaza_escrituras(self):
        for sql in (
            "INSERT INTO tareas (titulo) VALUES ('x')",
            "UPDATE tareas SET titulo = 'x'",
            "DELETE FROM tareas",
            "DROP TABLE tareas",
        ):
            with self.subTest(sql=sql):
                with self.assertRaises(ValueError):
                    sq.consultar(sql)

    def test_consultar_rechaza_varias_sentencias(self):
        with self.assertRaises(ValueError):
            sq.consultar("SELECT 1; SELECT 2")

    def test_herramienta_mcp_sqlite_estado(self):
        r = self._mcp("sqlite_estado", {})
        self.assertNotIn("isError", r["result"])
        self.assertIn('"tablas": 1', r["result"]["content"][0]["text"])

    def test_herramienta_mcp_sqlite_consultar(self):
        r = self._mcp("sqlite_consultar", {"sql": "SELECT titulo FROM tareas"})
        self.assertIn("conectar sqlite", r["result"]["content"][0]["text"])

    def test_herramienta_mcp_sqlite_rechaza_escritura(self):
        r = self._mcp("sqlite_consultar", {"sql": "DELETE FROM tareas"})
        self.assertTrue(r["result"]["isError"])

    def test_tools_list_incluye_sqlite(self):
        r = mcp_director.atender({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        nombres = [h["name"] for h in r["result"]["tools"]]
        for nombre in ("sqlite_estado", "sqlite_tablas", "sqlite_consultar"):
            self.assertIn(nombre, nombres)


if __name__ == "__main__":
    unittest.main()
