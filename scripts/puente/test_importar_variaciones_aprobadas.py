"""Pruebas del importador de variaciones aprobadas: solo funciones puras, sin red."""

import json
import tempfile
import unittest
from pathlib import Path

import importar_variaciones_aprobadas as imp
import importar_variaciones_red as red


def _ficha(clave="animacion:respiracion", nombre="Respiración lenta", estado="aprobada", extra=None):
    ficha = {
        "clave": clave,
        "nombre": nombre,
        "familia": clave.split(":")[0],
        "registro": "nexus",
        "fundamentos": ["respiración", "cristalización"],
        "parametros": {"duracionMs": 1200, "curva": "cubic-bezier(0.16, 1, 0.3, 1)"},
        "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0},
        "ejemplo": "examples/animacion.html",
        "referencias": [{"id": "motions", "que_se_aprendio": "curva suave"}],
        "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
        "estado": estado,
    }
    if extra:
        ficha.update(extra)
    return ficha


class CargaYValidacion(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.carpeta = Path(self._tmp.name) / "diseno" / "variaciones-aprobadas"
        self.carpeta.mkdir(parents=True)

    def tearDown(self):
        self._tmp.cleanup()

    def _escribir(self, nombre, ficha):
        (self.carpeta / nombre).write_text(
            json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")

    def test_carga_solo_aprobadas_e_ignora_json_roto(self):
        self._escribir("a.json", _ficha(nombre="Primera"))
        self._escribir("b.json", _ficha(clave="transicion:horizonte", estado="propuesta"))
        (self.carpeta / "c.json").write_text("{ sin cerrar", encoding="utf-8")
        cargadas = imp.load_variations(self.carpeta)
        self.assertEqual(len(cargadas), 1)
        self.assertEqual(cargadas[0]["nombre"], "Primera")
        self.assertEqual(imp.load_variations(Path(self._tmp.name) / "nada"), [])

    def test_ficha_completa_sin_errores(self):
        self.assertEqual(imp.validar_ficha(_ficha()), [])

    def test_ficha_defectuosa_reporta_cada_fallo(self):
        con_clave_rota = imp.validar_ficha(_ficha(clave="sin puntos !"))
        self.assertIn("clave inválida (formato familia:id)", con_clave_rota)
        con_familia_distinta = imp.validar_ficha(_ficha(extra={"familia": "otro", "nombre": "", "registro": "",
                                                               "licencia": "", "movimientoReducido": None,
                                                               "parametros": "no", "referencias": "tampoco"}))
        self.assertIn("la familia no coincide con la clave", con_familia_distinta)
        self.assertIn("falta el nombre", con_familia_distinta)
        self.assertIn("falta el registro", con_familia_distinta)
        self.assertIn("falta la licencia", con_familia_distinta)
        self.assertIn("falta movimientoReducido con su duracionMs", con_familia_distinta)
        self.assertIn("parametros debe ser un objeto", con_familia_distinta)
        self.assertIn("referencias debe ser una lista", con_familia_distinta)


class FilasYIdempotencia(unittest.TestCase):
    def test_fila_os_variaciones_cumple_el_contrato(self):
        fila = imp.fila_para_os_variaciones(_ficha(), "uuid-de-prueba")
        self.assertEqual(fila["clave"], "animacion:respiracion")
        self.assertEqual(fila["familia"], "animacion")
        self.assertEqual(fila["tipo"], "variacion")
        self.assertEqual(fila["titulo"], "Respiración lenta")
        self.assertEqual(fila["payload"]["estado"], "aprobada")
        self.assertIn("uuid-de-prueba", fila["autor"])
        self.assertIn("fundamentos", json.dumps(fila, ensure_ascii=False))

    def test_fila_library_categoria_carpeta_y_etiquetas(self):
        fila = imp.fila_para_library_public_items(_ficha())
        self.assertEqual(fila["category"], "design")
        self.assertEqual(fila["folder"], "diseño/animacion")
        self.assertEqual(fila["name"], "Respiración lenta")
        self.assertEqual(fila["payload"]["variacion"]["clave"], "animacion:respiracion")
        self.assertIn("respiración", fila["tags"])
        self.assertIn("nexus", fila["tags"])

    def test_etiquetas_sin_duplicar(self):
        idénticas = imp.etiquetas_de(_ficha(extra={"fundamentos": ["nexus", "Nexus"]}))
        self.assertEqual(idénticas.count("nexus"), 1)

    def test_destino_segun_tabla_y_autor(self):
        self.assertEqual(imp.destino_de(True, "uuid"), imp.TABLA_OS)
        self.assertEqual(imp.destino_de(True, ""), imp.TABLA_LIB)
        self.assertEqual(imp.destino_de(False, "uuid"), imp.TABLA_LIB)

    def test_idempotencia_por_clave_y_nombre(self):
        limite = [("animacion:respiracion", "Respiración lenta")]
        queda = imp.sin_ya_publicadas(
            [_ficha(), _ficha(clave="animacion:alquimia", nombre="Alquimia de módulo")], limite)
        self.assertEqual(len(queda), 1)
        self.assertEqual(queda[0]["clave"], "animacion:alquimia")


class EntornoYApi(unittest.TestCase):
    def test_leer_env_solo_pide_lo_que_necesita(self):
        with tempfile.TemporaryDirectory() as tmp:
            ruta = Path(tmp) / "env"
            ruta.write_text(
                'export NEXT_PUBLIC_SUPABASE_URL="https://prueba.supabase.co"\n'
                "# comentario\nOTRA=íntegra\n", encoding="utf-8")
            halladas = red.leer_env([imp.ENV_URL, imp.ENV_CLAVE], rutas=[ruta])
            self.assertEqual(halladas[imp.ENV_URL], "https://prueba.supabase.co")
            self.assertNotIn(imp.ENV_CLAVE, halladas)
            self.assertNotIn("OTRA", halladas)

    def test_tabla_ausente_y_presente(self):
        self.assertTrue(imp.es_tabla_ausente(404, ""))
        self.assertTrue(imp.es_tabla_ausente(400, "PGRST205: Could not find the table"))
        self.assertFalse(imp.es_tabla_ausente(200, "[]"))


if __name__ == "__main__":
    unittest.main()
