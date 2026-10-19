import json
import os
import tempfile
import unittest
from pathlib import Path

from scripts.puente.importar_variaciones_aprobadas import load_variations


class TestImportarVariacionesAprobadas(unittest.TestCase):

    def setUp(self) -> None:
        self._tmp_dir = tempfile.mkdtemp()
        # Crear directorio esperado dentro del tmp
        self.variations_dir = Path(self._tmp_dir) / "diseno" / "variaciones-aprobadas"
        self.variations_dir.mkdir(parents=True)

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self._tmp_dir)

    def test_load_no_variations(self) -> None:
        # Cuando no hay fichas, devuelve lista vacía
        result = load_variations()
        self.assertEqual(result, [])

    def test_load_approved_variation(self) -> None:
        ficha = {
            "clave": "animacion:respiracion",
            "nombre": "Respiración lenta",
            "familia": "animacion",
            "registro": "nexus",
            "fundamentos": ["inspiración", "espiral"],
            "parametros": {"duracionMs": 1200, "curva": "cubic-bezier(0.16,1,0.3,1)"},
            "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0},
            "ejemplo": "examples/animacion.html",
            "referencias": [{"id": "motions", "que_se_aprendio": "curva suave"}],
            "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
            "estado": "aprobada"
        }
        archivo = self.variations_dir / "animacion-respiracion.json"
        archivo.write_text(json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")
        result = load_variations(custom_dir=self.variations_dir)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["clave"], "animacion:respiracion")
        self.assertEqual(result[0]["estado"], "aprobada")

    def test_load_non_approved_ignored(self) -> None:
        ficha = {
            "clave": "animacion:otra",
            "nombre": "Otra animación",
            "familia": "animacion",
            "registro": "nexus",
            "fundamentos": [],
            "parametros": {},
            "movimientoReducido": {"duracionMs": 200, "recorridoPx": 0},
            "ejemplo": None,
            "referencias": [],
            "licencia": "MIT",
            "estado": "propuesta"
        }
        archivo = self.variations_dir / "animacion-otra.json"
        archivo.write_text(json.dumps(ficha, ensure_ascii=False, indent=2), encoding="utf-8")
        result = load_variations(custom_dir=self.variations_dir)
        self.assertEqual(len(result), 0)