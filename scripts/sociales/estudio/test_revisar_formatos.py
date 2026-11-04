"""Pruebas para la re-verificación trimestral del catálogo de formatos (EST-FORMATOS-REVISION).

   python3 -m unittest scripts/sociales/estudio/test_revisar_formatos.py -v

Cubre: comparación de catálogos, detección de añadidos/eliminaciones/modificaciones,
escritura de diferencias con fecha de revisión, y que nunca se inventa un formato.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
import sys

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import revisar_formatos  # noqa: E402


FORMATO_BASE = {
    "id": "test-formato",
    "medio": "test",
    "nombre": "Test Formato",
    "tipos": ["imagen"],
    "ancho": 100,
    "alto": 100,
    "contenedores": ["png"],
    "margenes": {"arriba": 10, "abajo": 10, "izquierda": 10, "derecha": 10},
    "margenesOrigen": "criterio-estudio",
    "fuentes": ["test-fuente"],
    "relacion": "1:1",
    "formato_pieza": "100x100",
}


class TestCompararCatalogos(unittest.TestCase):
    def test_sin_cambios_devuelve_vacio(self):
        catalogo = {"version": 1, "formatos": [FORMATO_BASE]}
        diff = revisar_formatos.comparar(catalogo, catalogo)
        self.assertEqual(diff["añadidos"], [])
        self.assertEqual(diff["eliminados"], [])
        self.assertEqual(diff["modificados"], [])

    def test_detecta_formato_añadido(self):
        actual = {"version": 1, "formatos": [FORMATO_BASE]}
        nuevo = {"version": 2, "formatos": [FORMATO_BASE, {**FORMATO_BASE, "id": "test-nuevo", "nombre": "Test Nuevo"}]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(len(diff["añadidos"]), 1)
        self.assertEqual(diff["añadidos"][0]["id"], "test-nuevo")

    def test_detecta_formato_eliminado(self):
        actual = {"version": 1, "formatos": [FORMATO_BASE, {**FORMATO_BASE, "id": "test-viejo", "nombre": "Test Viejo"}]}
        nuevo = {"version": 2, "formatos": [FORMATO_BASE]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(len(diff["eliminados"]), 1)
        self.assertEqual(diff["eliminados"][0]["id"], "test-viejo")

    def test_detecta_modificacion_en_campos_simples(self):
        actual = {"version": 1, "formatos": [FORMATO_BASE]}
        modificado = {**FORMATO_BASE, "ancho": 200, "alto": 150, "formato_pieza": "200x150"}
        nuevo = {"version": 2, "formatos": [modificado]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(len(diff["modificados"]), 1)
        mod = diff["modificados"][0]
        self.assertEqual(mod["id"], "test-formato")
        self.assertIn("ancho", mod["campos"])
        self.assertEqual(mod["campos"]["ancho"]["antes"], 100)
        self.assertEqual(mod["campos"]["ancho"]["despues"], 200)

    def test_detecta_modificacion_en_margenes(self):
        actual = {"version": 1, "formatos": [FORMATO_BASE]}
        modificado = {**FORMATO_BASE, "margenes": {"arriba": 20, "abajo": 20, "izquierda": 20, "derecha": 20}}
        nuevo = {"version": 2, "formatos": [modificado]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(len(diff["modificados"]), 1)
        mod = diff["modificados"][0]
        # La estructura se aplana: margenes.arriba, margenes.abajo, etc.
        self.assertIn("margenes.arriba", mod["campos"])
        self.assertEqual(mod["campos"]["margenes.arriba"]["antes"], 10)
        self.assertEqual(mod["campos"]["margenes.arriba"]["despues"], 20)
        self.assertEqual(mod["campos"]["margenes.abajo"]["antes"], 10)
        self.assertEqual(mod["campos"]["margenes.abajo"]["despues"], 20)

    def test_detecta_modificacion_en_listas_fuentes_y_conflictos(self):
        base = {**FORMATO_BASE, "fuentes": ["a"], "conflictos": ["c1"]}
        actual = {"version": 1, "formatos": [base]}
        modificado = {**base, "fuentes": ["a", "b"], "conflictos": ["c1", "c2"]}
        nuevo = {"version": 2, "formatos": [modificado]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(len(diff["modificados"]), 1)
        mod = diff["modificados"][0]
        self.assertIn("fuentes", mod["campos"])
        self.assertIn("conflictos", mod["campos"])

    def test_ignora_campo_version_del_catalogo(self):
        actual = {"version": 1, "formatos": [FORMATO_BASE]}
        nuevo = {"version": 999, "formatos": [FORMATO_BASE]}
        diff = revisar_formatos.comparar(actual, nuevo)
        self.assertEqual(diff["modificados"], [])


class TestEscribirRevision(unittest.TestCase):
    def test_escribe_archivo_con_fecha_y_diferencias(self):
        diff = {
            "fecha": "2026-10-10",
            "añadidos": [{"id": "nuevo", "nombre": "Nuevo"}],
            "eliminados": [{"id": "viejo", "nombre": "Viejo"}],
            "modificados": [{"id": "mod", "campos": {"ancho": {"antes": 100, "despues": 200}}}],
        }
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "revision.json"
            revisar_formatos.escribir_revision(ruta, diff)
            contenido = json.loads(ruta.read_text(encoding="utf-8"))
            self.assertEqual(contenido["fecha"], "2026-10-10")
            self.assertEqual(len(contenido["añadidos"]), 1)
            self.assertEqual(len(contenido["eliminados"]), 1)
            self.assertEqual(len(contenido["modificados"]), 1)

    def test_fecha_por_defecto_es_hoy_si_no_se_pasa(self):
        diff = {"añadidos": [], "eliminados": [], "modificados": []}
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "revision.json"
            revisar_formatos.escribir_revision(ruta, diff)
            contenido = json.loads(ruta.read_text(encoding="utf-8"))
            self.assertEqual(contenido["fecha"], date.today().isoformat())

    def test_no_inventa_formatos_que_no_vienen_en_la_entrada(self):
        """La regla de oro: nunca se inventa un formato que no venga en la entrada."""
        actual = {"version": 1, "formatos": [FORMATO_BASE]}
        nuevo = {"version": 2, "formatos": [FORMATO_BASE]}
        diff = revisar_formatos.comparar(actual, nuevo)
        # Solo puede reportar lo que hay en las dos entradas
        todos_ids = {f["id"] for f in actual["formatos"]} | {f["id"] for f in nuevo["formatos"]}
        for cat in ("añadidos", "eliminados", "modificados"):
            for item in diff[cat]:
                self.assertIn(item["id"], todos_ids, f"{cat} contiene id inventado: {item['id']}")


class TestCargarFormatoJson(unittest.TestCase):
    def test_carga_el_json_real(self):
        ruta = AQUI / "formatos.json"
        self.assertTrue(ruta.exists())
        data = revisar_formatos.cargar_catalogo(ruta)
        self.assertIn("version", data)
        self.assertIn("formatos", data)
        self.assertGreater(len(data["formatos"]), 50)


if __name__ == "__main__":
    unittest.main()