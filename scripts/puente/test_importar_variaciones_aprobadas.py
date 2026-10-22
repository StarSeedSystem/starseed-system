"""Pruebas puras de importar_variaciones_aprobadas.py (DSN1019Kc): sin red, transporte simulado."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importar_variaciones_aprobadas as iva

FICHA = {
    "clave": "transicion:entrada-cardinal",
    "nombre": "Entrada cardinal · expresiva",
    "familia": "transicion",
    "registro": "nexus",
    "fundamentos": ["anticipación", "aceleración y frenado", "escalonado"],
    "parametros": {"duracionMs": 720, "curva": "cubic-bezier(0.16, 1, 0.3, 1)", "recorridoPx": 24, "escalonadoMs": 60},
    "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0},
    "ejemplo": "examples/transiciones.html#entrada-cardinal",
    "referencias": [{"id": "transitions-dev", "que_se_aprendio": "orden de entrada por grupos"}],
    "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
    "estado": "aprobada",
}

# Simulador sin red: respuesta por (método, tabla); guardo las llamadas.
class Transporte:
    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.llamados = []

    def __call__(self, metodo, ruta, cuerpo=None):
        tablas = ruta.split("/rest/v1/")[-1].split("?")[0].split("/")[0]
        self.llamados.append((metodo, tablas))
        if (metodo, tablas) not in self.respuestas:
            return 500, "transporte sin respuesta para %s %s" % (metodo, tablas)
        return self.respuestas[(metodo, tablas)]


def _escribir_ficha(dir_path: Path, ficha: dict) -> None:
    (dir_path / (ficha["clave"].replace(":", "-") + ".json")).write_text(json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")


class TestCargarFichas(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.mkdtemp()
        self.carpeta = Path(self._dir) / "diseno" / "variaciones-aprobadas"
        self.carpeta.mkdir(parents=True)

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self._dir)

    def test_carpeta_inexistente(self) -> None:
        self.assertEqual(iva.load_variations(Path(self._dir) / "nada"), [])

    def test_carga_aprobadas_y_descarta_otras(self) -> None:
        _escribir_ficha(self.carpeta, FICHA)
        otra = dict(FICHA, clave="sonido:logo", nombre="Logo sonoro", estado="propuesta")
        _escribir_ficha(self.carpeta, otra)
        cargadas = iva.load_variations(self.carpeta)
        self.assertEqual([f["clave"] for f in cargadas], ["transicion:entrada-cardinal"])
        self.assertEqual(cargadas[0]["estado"], "aprobada")


class TestValidarFicha(unittest.TestCase):
    def test_formato_se3_valido(self) -> None:
        self.assertEqual(iva.validar_ficha(FICHA), [])

    def test_errores(self) -> None:
        self.assertIn("licencia ausente", "; ".join(iva.validar_ficha(dict(FICHA, licencia=""))))
        self.assertIn("clave ha de ser", "; ".join(iva.validar_ficha(dict(FICHA, clave="nueva"))))
        self.assertIn("versión reducida", "; ".join(iva.validar_ficha({k: v for k, v in FICHA.items() if k != "movimientoReducido"})))
        self.assertIn("parametros ha de ser objeto", "; ".join(iva.validar_ficha(dict(FICHA, parametros=None))))
        self.assertIn("nombre ausente", "; ".join(iva.validar_ficha(dict(FICHA, nombre=""))))


class TestFilas(unittest.TestCase):
    def test_fila_os_variaciones(self) -> None:
        fila = iva.fila_os_variaciones(FICHA, "autor-uuid")
        self.assertEqual(fila["clave"], "transicion:entrada-cardinal")
        self.assertEqual(fila["tipo"], "variacion")
        self.assertEqual(fila["titulo"], FICHA["nombre"])
        self.assertEqual(fila["autor"], "autor-uuid")
        self.assertIn("referencias", fila["payload"])
        self.assertIn("variacion", fila["etiquetas"])

    def test_fila_library_public_items(self) -> None:
        fila = iva.fila_library_public_items(FICHA, "autor-uuid")
        self.assertEqual(fila["category"], "design")
        self.assertEqual(fila["folder"], "diseño/transicion")
        self.assertEqual(fila["name"], FICHA["nombre"])
        self.assertEqual(fila["payload"]["ficha"]["referencias"], FICHA["referencias"])


class TestPublicarFicha(unittest.TestCase):
    def test_idempotente_os_variaciones(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (200, '[{"id": "ya"}]')})
        self.assertEqual(iva.publicar_ficha(FICHA, "a", t), ("ya_estaba", "os_variaciones"))
        self.assertEqual(t.llamados, [("GET", "os_variaciones")])

    def test_publica_en_os_variaciones(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (200, "[]"), ("POST", "os_variaciones"): (201, "")})
        self.assertEqual(iva.publicar_ficha(FICHA, "a", t), ("publicada", "os_variaciones"))
        self.assertEqual(t.llamados, [("GET", "os_variaciones"), ("POST", "os_variaciones")])

    def test_fallback_a_libreria(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (404, '{"code": "PGRST205"}'),
                        ("GET", "library_public_items"): (200, "[]"),
                        ("POST", "library_public_items"): (201, "")})
        self.assertEqual(iva.publicar_ficha(FICHA, "a", t), ("publicada", "library_public_items"))

    def test_error_si_ninguna_tabla_esta(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (404, '{"code": "PGRST205"}'),
                        ("GET", "library_public_items"): (404, '{"code": "42P01"}')})
        accion, _ = iva.publicar_ficha(FICHA, "a", t)
        self.assertEqual(accion, "error")

    def test_idempotente_en_libreria(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (404, '{"code": "PGRST205"}'),
                        ("GET", "library_public_items"): (200, '[{"id": "ya"}]')})
        self.assertEqual(iva.publicar_ficha(FICHA, "a", t), ("ya_estaba", "library_public_items"))

    def test_error_del_post(self) -> None:
        t = Transporte({("GET", "os_variaciones"): (200, "[]"), ("POST", "os_variaciones"): (400, '{"message": "no"}')})
        accion, detalle = iva.publicar_ficha(FICHA, "a", t)
        self.assertEqual(accion, "error")
        self.assertIn("400", detalle)


if __name__ == "__main__":
    unittest.main()
