import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from scripts.puente.importar_variaciones_aprobadas import load_variations, _prepare_variation_data, upsert_variation


class TestImportarVariacionesAprobadas(unittest.TestCase):

    def setUp(self) -> None:
        self._tmp_dir = tempfile.mkdtemp()
        # Crear directorio esperado dentro del tmp
        self.variations_dir = Path(self._tmp_dir) / "diseno" / "variaciones-aprobadas"
        self.variations_dir.mkdir(parents=True)
        # Establecer variables de entorno para Supabase
        os.environ["SUPABASE_URL"] = "https://test.supabase.co"
        os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self._tmp_dir)
        # Limpiar variables de entorno
        os.environ.pop("SUPABASE_URL", None)
        os.environ.pop("SUPABASE_ANON_KEY", None)

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

    def test_prepare_variation_data(self) -> None:
        variation = {
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
        expected = {
            "clave": "animacion:respiracion",
            "nombre": "Respiración lenta",
            "familia": "animacion",
            "registro": "nexus",
            "fundamentos": ["inspiración", "espiral"],
            "parametros": {"duracionMs": 1200, "curva": "cubic-bezier(0.16,1,0.3,1)"},
            "movimiento_reducido": {"duracionMs": 200, "recorridoPx": 0},
            "ejemplo": "examples/animacion.html",
            "referencias": [{"id": "motions", "que_se_aprendio": "curva suave"}],
            "licencia": "AGPL-3.0-or-later (código) · CC-BY-SA-4.0 (diseño)",
        }
        result = _prepare_variation_data(variation)
        self.assertEqual(result, expected)

    @patch('scripts.puente.importar_variaciones_aprobadas._get_supabase_client')
    def test_upsert_variation_calls_supabase(self, mock_get_client) -> None:
        # Mock del cliente de Supabase
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Mock de la respuesta de upsert
        mock_response = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.return_value = mock_response

        variation = {
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

        # Llamamos a la función
        upsert_variation(variation)

        # Verificamos que se llamó al cliente de Supabase
        mock_get_client.assert_called_once()
        # Verificamos que se intentó primero en os_variaciones
        mock_client.table.assert_called_with("os_variaciones")
        # Verificamos que se llamó a upsert con los datos correctos y on_conflict
        mock_client.table.return_value.upsert.assert_called()
        args, kwargs = mock_client.table.return_value.upsert.call_args
        self.assertEqual(args[0]["clave"], "animacion:respiracion")
        self.assertEqual(args[0]["nombre"], "Respiración lenta")
        self.assertEqual(kwargs.get("on_conflict"), "clave,nombre")
        # Verificamos que se ejecutó
        mock_client.table.return_value.upsert.return_value.execute.assert_called_once()

    @patch('scripts.puente.importar_variaciones_aprobadas._get_supabase_client')
    def test_upsert_variation_fallback_to_library_public_items(self, mock_get_client) -> None:
        # Mock del cliente de Supabase
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Simulamos que la primera llamada (os_variaciones) falla porque la tabla no existe
        # y la segunda (library_public_items) tiene éxito.
        def side_effect(table_name, *args, **kwargs):
            if table_name == "os_variaciones":
                raise Exception("does not exist")
            else:
                mock_table = MagicMock()
                mock_table.upsert.return_value.execute.return_value = MagicMock()
                return mock_table
        mock_client.table.side_effect = side_effect

        variation = {
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

        # Llamamos a la función
        upsert_variation(variation)

        # Verificamos que se llamó al cliente de Supabase dos veces (una para cada tabla)
        self.assertEqual(mock_client.table.call_count, 2)
        # Primera llamada: os_variaciones
        mock_client.table.assert_any_call("os_variaciones")
        # Segunda llamada: library_public_items
        mock_client.table.assert_any_call("library_public_items")
        # Verificamos que no se lanzó una excepción inesperada
        # (si la función lanza una excepción, el test fallará)

    @patch('scripts.puente.importar_variaciones_aprobadas._get_supabase_client')
    def test_upsert_variation_calls_supabase(self, mock_get_client) -> None:
        # Mock del cliente de Supabase
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Mock de la respuesta de upsert
        mock_response = MagicMock()
        mock_client.table.return_value.upsert.return_value.execute.return_value = mock_response

        variation = {
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

        # Llamamos a la función
        upsert_variation(variation)

        # Verificamos que se llamó al cliente de Supabase
        mock_get_client.assert_called_once()
        # Verificamos que se intentó primero en os_variaciones
        mock_client.table.assert_called_with("os_variaciones")
        # Verificamos que se llamó a upsert con los datos correctos y on_conflict
        mock_client.table.return_value.upsert.assert_called()
        args, kwargs = mock_client.table.return_value.upsert.call_args
        self.assertEqual(args[0]["clave"], "animacion:respiracion")
        self.assertEqual(args[0]["nombre"], "Respiración lenta")
        self.assertEqual(kwargs.get("on_conflict"), "clave,nombre")
        # Verificamos que se ejecutó
        mock_client.table.return_value.upsert.return_value.execute.assert_called_once()

    @patch('scripts.puente.importar_variaciones_aprobadas._get_supabase_client')
    def test_upsert_variation_fallback_to_library_public_items(self, mock_get_client) -> None:
        # Mock del cliente de Supabase
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client
        # Simulamos que la primera llamada (os_variaciones) falla porque la tabla no existe
        # y la segunda (library_public_items) tiene éxito.
        def side_effect(table_name, *args, **kwargs):
            if table_name == "os_variaciones":
                raise Exception("does not exist")
            else:
                mock_table = MagicMock()
                mock_table.upsert.return_value.execute.return_value = MagicMock()
                return mock_table
        mock_client.table.side_effect = side_effect

        variation = {
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

        # Llamamos a la función
        upsert_variation(variation)

        # Verificamos que se llamó al cliente de Supabase dos veces (una para cada tabla)
        self.assertEqual(mock_client.table.call_count, 2)
        # Primera llamada: os_variaciones
        mock_client.table.assert_any_call("os_variaciones")
        # Segunda llamada: library_public_items
        mock_client.table.assert_any_call("library_public_items")