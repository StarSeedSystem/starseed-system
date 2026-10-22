#!/usr/bin/env python3
"""Pruebas sin red del importador de variaciones aprobadas (DSN1019Kc)."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importar_variaciones_aprobadas as mv


def _ficha(clave="animacion:respiracion", nombre="Respiración lenta", estado="aprobada"):
    return {
        "clave": clave,
        "nombre": nombre,
        "familia": clave.split(":", 1)[0],
        "registro": "nexus",
        "fundamentos": ["inspiración", "espiral áurea"],
        "parametros": {"duracionMs": 1200, "curva": "cubic-bezier(0.16,1,0.3,1)"},
        "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0},
        "ejemplo": "examples/animacion.html",
        "referencias": [{"id": "motion-primitives", "que_se_aprendio": "curva suave"}],
        "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
        "estado": estado,
    }


class ImportarVariacionesAprobadas(unittest.TestCase):
    def setUp(self):
        self._dir = tempfile.mkdtemp()
        self.carpeta = os.path.join(self._dir, "diseno", "variaciones-aprobadas")
        os.makedirs(self.carpeta)

    def tearDown(self):
        for nombre in os.listdir(self.carpeta):
            os.remove(os.path.join(self.carpeta, nombre))
        os.removedirs(self.carpeta)

    # _leer_env: nombra variables, jamás imprime valores (aquí es un valor falso de prueba)
    def test_leer_env_prefiere_el_entorno_del_proceso(self):
        os.environ["STARSEED_VARIACIONES_PRUEBA"] = "valor-falso-de-prueba"
        try:
            self.assertEqual(mv._leer_env("STARSEED_VARIACIONES_PRUEBA"), "valor-falso-de-prueba")
            self.assertEqual(mv._leer_env("STARSEED_VARIACIONES_INEXISTENTE_XYZ"), "")
        finally:
            os.environ.pop("STARSEED_VARIACIONES_PRUEBA", None)

    # cargar_fichas (sin red)
    def test_carga_solo_las_aprobadas_y_ignora_lo_corrupto(self):
        with open(os.path.join(self.carpeta, "a.json"), "w", encoding="utf-8") as f:
            json.dump(_ficha(), f)
        with open(os.path.join(self.carpeta, "b.json"), "w", encoding="utf-8") as f:
            json.dump(_ficha(clave="transicion:entrada-cardinal", nombre="Entrada cardinal", estado="propuesta"), f)
        with open(os.path.join(self.carpeta, "c.json"), "w", encoding="utf-8") as f:
            f.write("{ corrupto ")
        self.assertEqual([f["clave"] for f in mv.cargar_fichas(self.carpeta)], ["animacion:respiracion"])

    def test_sin_carpeta_devuelve_vacio(self):
        self.assertEqual(mv.cargar_fichas(os.path.join(self._dir, "no-existe")), [])

    # validar_ficha
    def test_ficha_completa_no_da_errores(self):
        self.assertEqual(mv.validar_ficha(_ficha()), [])

    def test_ficha_incompleta_lista_los_errores(self):
        errores = mv.validar_ficha({"clave": "coche:semaforo", "estado": "oculta"})
        self.assertIn("la clave no es «familia:id» de las familias del sistema", errores)
        self.assertIn("falta «nombre»", errores)
        self.assertIn("el estado no es «aprobada»", errores)

    def test_sin_movimiento_reducido_o_parametros_es_error(self):
        ficha = _ficha()
        ficha["movimientoReducido"] = {}  # siempre versión reducida: es obligatoria
        self.assertTrue(any("movimientoReducido" in e for e in mv.validar_ficha(ficha)))
        ficha["movimientoReducido"] = {"duracionMs": 200}
        ficha["parametros"] = "no debo"
        self.assertTrue(any("parametros" in e for e in mv.validar_ficha(ficha)))

    # filas y genero
    def test_genero_lleva_familia_registro_y_referencias(self):
        etiquetas = mv.genero_de(_ficha())
        self.assertEqual(etiquetas[:2], ["animacion", "registro:nexus"])
        self.assertIn("motion-primitives", etiquetas)

    def test_fila_os_variaciones_respeta_la_migracion(self):
        fila = mv.fila_os_variaciones(_ficha())
        self.assertEqual(fila["clave"], "animacion:respiracion")
        self.assertEqual(fila["familia"], "animacion")
        self.assertEqual(fila["tipo"], "variacion")
        self.assertEqual(fila["etiquetas"], mv.genero_de(_ficha()))
        self.assertIn("referencias", fila["payload"])

    def test_fila_library_es_design_con_carpeta_de_familia(self):
        fila = mv.fila_library_public_item(_ficha(clave="tema:noche"))
        self.assertEqual(fila["category"], "design")
        self.assertEqual(fila["folder"], "diseño/tema")
        self.assertIn("etiquetas", fila["payload"])
        self.assertIn("referencias", fila["payload"]["ficha"])

    # idempotencia por clave+nombre
    def test_sin_duplicadas_os_y_library(self):
        f1 = mv.fila_os_variaciones(_ficha())
        f2 = mv.fila_os_variaciones(_ficha(nombre="Respiración lenta II"))
        self.assertEqual(mv.sin_duplicadas([f1, f2], [{"clave": "animacion:respiracion", "titulo": "Respiración lenta"}], "os_variaciones"), [f2])
        li = mv.fila_library_public_item(_ficha())
        sin = mv.sin_duplicadas([li], [{"name": "Respiración lenta", "payload": "animacion:respiracion"}], "library_public_items")
        self.assertEqual(sin, [])

    def test_par_idempotente_difiere_por_tabla(self):
        fila = mv.fila_library_public_item(_ficha())
        self.assertEqual(mv.par_idempotente(fila, "library_public_items")[1], "Respiración lenta")
        self.assertEqual(mv.par_idempotente(mv.fila_os_variaciones(_ficha()), "os_variaciones")[0], "animacion:respiracion")


if __name__ == "__main__":
    unittest.main()
