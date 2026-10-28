#!/usr/bin/env python3
import os
import sys
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ""))

from asignaciones_agentes import (
    leer_asignaciones_agentes,
    modelo_por_papel,
    habilitar_director,
    modelos_director,
)


class TestAsignacionesAgentes(unittest.TestCase):

    def setUp(self):
        """Configurar el entorno de prueba."""
        self.temp_dir = tempfile.mkdtemp()
        self.asignaciones_path = Path(self.temp_dir) / "mando" / "asignaciones-agentes.json"
        self.asignaciones_path.parent.mkdir(parents=True, exist_ok=True)

        # Valores predeterminados para respaldo
        self.modelos_globales = ["modelo1", "modelo2", "modelo3"]
        self.starseed_opus_director = "1"

    def tearDown(self):
        """Limpiar el entorno de prueba."""
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_leer_asignaciones_agentes_con_archivo(self):
        """Test que leer_asignaciones_agentes lee desde el JSON cuando existe."""
        # Datos de prueba
        datos_prueba = {
            "por_papel": {
                "escritor": ["writer_model1", "writer_model2"],
                "revisor": ["reviewer_model1"],
                "chat": ["chat_model1", "chat_model2", "chat_model3"],
                "visión": ["vision_model1"],
                "imagen": ["image_model1"],
                "código": ["code_model1", "code_model2"],
            },
            "por_director": {
                "chat": {"habilitado": True, "modelos": ["director_chat_model1", "director_chat_model2"]},
                "optimizador": {"habilitado": False, "modelos": ["director_optimizer_model1"]},
                "diseño": {"habilitado": True, "modelos": ["director_design_model1"]},
            },
        }

        # Escribir el archivo de prueba
        self.asignaciones_path.write_text(
            json.dumps(datos_prueba, ensure_ascii=False), encoding="utf-8"
        )

        # Mockear la ruta para que apunte al archivo temporal
        with patch("asignaciones_agentes.RUTA_ASIGNACIONES", str(self.asignaciones_path)):
            resultado = leer_asignaciones_agentes(
                self.modelos_globales, self.starseed_opus_director
            )

        # Validar el resultado
        self.assertEqual(resultado["por_papel"]["escritor"], ["writer_model1", "writer_model2"])
        self.assertEqual(resultado["por_papel"]["chat"], ["chat_model1", "chat_model2", "chat_model3"])
        self.assertEqual(resultado["por_papel"]["revisor"], ["reviewer_model1"])

        self.assertTrue(habilitar_director("chat", resultado))
        self.assertFalse(habilitar_director("optimizador", resultado))
        self.assertEqual(modelos_director("chat", resultado), ["director_chat_model1", "director_chat_model2"])
        self.assertEqual(modelos_director("optimizador", resultado), ["director_optimizer_model1"])

    def test_leer_asignaciones_agentes_sin_archivo(self):
        """Test que leer_asignaciones_agentes usa valores de respaldo cuando el archivo está ausente."""
        # Mockear la ruta para que apunte a un archivo no existente (la ruta temporal ya no existe)
        with patch("asignaciones_agentes.RUTA_ASIGNACIONES", str(self.asignaciones_path)):
            resultado = leer_asignaciones_agentes(
                self.modelos_globales, self.starseed_opus_director
            )

        # Validar valores de respaldo
        self.assertEqual(resultado["por_papel"]["escritor"], self.modelos_globales)
        self.assertEqual(resultado["por_papel"]["revisor"], self.modelos_globales)
        self.assertEqual(resultado["por_papel"]["chat"], self.modelos_globales)
        self.assertEqual(resultado["por_papel"]["visión"], self.modelos_globales)
        self.assertEqual(resultado["por_papel"]["imagen"], self.modelos_globales)
        self.assertEqual(resultado["por_papel"]["código"], self.modelos_globales)

        # Validar habilitación de directores
        self.assertTrue(habilitar_director("chat", resultado))
        self.assertTrue(habilitar_director("optimizador", resultado))
        self.assertTrue(habilitar_director("diseño", resultado))

        # Validar cadenas de modelos para directores
        self.assertEqual(modelos_director("chat", resultado), self.modelos_globales)
        self.assertEqual(modelos_director("optimizador", resultado), self.modelos_globales)
        self.assertEqual(modelos_director("diseño", resultado), self.modelos_globales)

    def test_leer_asignaciones_agentes_archivo_json_invalido(self):
        """Test que leer_asignaciones_agentes maneja JSON inválido y usa respaldo."""
        # Escribir JSON inválido
        self.asignaciones_path.write_text("{ inválido }", encoding="utf-8")

        with patch("asignaciones_agentes.RUTA_ASIGNACIONES", str(self.asignaciones_path)):
            resultado = leer_asignaciones_agentes(
                self.modelos_globales, self.starseed_opus_director
            )

        # Debe caer en respaldo
        self.assertEqual(resultado["por_papel"]["escritor"], self.modelos_globales)

    def test_modelo_por_papel_existente(self):
        """Test que modelo_por_papel devuelve el correcto para un papel existente."""
        asignaciones = {
            "por_papel": {
                "escritor": ["writer1", "writer2"],
                "revisor": ["reviewer1"],
            }
        }

        escritor_models = modelo_por_papel("escritor", asignaciones)
        revisor_models = modelo_por_papel("revisor", asignaciones)

        self.assertEqual(escritor_models, ["writer1", "writer2"])
        self.assertEqual(revisor_models, ["reviewer1"])

    def test_modelo_por_papel_no_existente(self):
        """Test que modelo_por_papel devuelve lista vacía para un papel no existente."""
        asignaciones = {
            "por_papel": {
                "escritor": ["writer1"],
            }
        }

        cadena_no_existente = modelo_por_papel("no_existente", asignaciones)
        self.assertEqual(cadena_no_existente, [])

    def test_habilitar_director_habilitado(self):
        """Test que habilitar_director devuelve True cuando está habilitado."""
        asignaciones = {
            "por_director": {
                "chat": {"habilitado": True, "modelos": []},
                "optimizador": {"habilitado": False, "modelos": []},
            }
        }

        self.assertTrue(habilitar_director("chat", asignaciones))
        self.assertFalse(habilitar_director("optimizador", asignaciones))

    def test_habilitar_director_no_existente(self):
        """Test que habilitar_director devuelve False para un director no existente."""
        asignaciones = {
            "por_director": {
                "chat": {"habilitado": True, "modelos": []},
            }
        }

        self.assertFalse(habilitar_director("no_existente", asignaciones))

    def test_modelos_director_existente(self):
        """Test que modelos_director devuelve el correcto para un director existente."""
        asignaciones = {
            "por_director": {
                "chat": {"habilitado": True, "modelos": ["chat_model1", "chat_model2"]},
                "optimizador": {"habilitado": False, "modelos": ["optimizer_model1"]},
            }
        }

        chat_models = modelos_director("chat", asignaciones)
        optimizer_models = modelos_director("optimizador", asignaciones)

        self.assertEqual(chat_models, ["chat_model1", "chat_model2"])
        self.assertEqual(optimizer_models, ["optimizer_model1"])

    def test_modelos_director_no_existente(self):
        """Test que modelos_director devuelve lista vacía para un director no existente."""
        asignaciones = {
            "por_director": {
                "chat": {"habilitado": True, "modelos": ["chat_model1"]},
            }
        }

        cadena_no_existente = modelos_director("no_existente", asignaciones)
        self.assertEqual(cadena_no_existente, [])

    def test_asignaciones_agentes_todo_nulo(self):
        """Test que leer_asignaciones_agentes maneja JSON con valores nulos."""
        asignaciones = {
            "por_papel": None,
            "por_director": None,
        }

        self.asignaciones_path.write_text(
            json.dumps(asignaciones, ensure_ascii=False), encoding="utf-8"
        )

        with patch("asignaciones_agentes.RUTA_ASIGNACIONES", str(self.asignaciones_path)):
            resultado = leer_asignaciones_agentes(
                self.modelos_globales, self.starseed_opus_director
            )

        # Debe tener valores de respaldo
        self.assertEqual(resultado["por_papel"], {})
        self.assertEqual(resultado["por_director"], {})

    def test_starseed_opus_director_cero(self):
        """Test que STARSEED_OPUS_DIRECTOR=0 deshabilita todos los directores."""
        asignaciones = leer_asignaciones_agentes(
            self.modelos_globales, "0"
        )

        for director in ["chat", "optimizador", "diseño", "producción", "nube", "medidores", "aprendizaje"]:
            self.assertFalse(habilitar_director(director, asignaciones))


class RaizDelRepositorio(unittest.TestCase):
    """OPS1024A: RAIZ es la raíz del repositorio (no `scripts/`) y respeta STARSEED_ROOT."""

    def _recargar(self, entorno):
        import importlib
        import asignaciones_agentes as A
        with patch.dict(os.environ, entorno, clear=False):
            if "STARSEED_ROOT" not in entorno:
                os.environ.pop("STARSEED_ROOT", None)
            importlib.reload(A)
            return A.RAIZ, A.RUTA_ASIGNACIONES

    def tearDown(self):
        import importlib
        import asignaciones_agentes as A
        importlib.reload(A)

    def test_raiz_por_defecto_es_la_del_repositorio(self):
        """Sin STARSEED_ROOT, RAIZ apunta a la raíz del repo (la que contiene CLAUDE.md)."""
        repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        raiz, ruta = self._recargar({})
        self.assertEqual(os.path.abspath(raiz), repo)
        self.assertTrue(os.path.isfile(os.path.join(repo, "CLAUDE.md")), repo)
        self.assertEqual(
            ruta,
            os.path.join(repo, "starseed_memory_root", "mando", "asignaciones-agentes.json"),
        )

    def test_raiz_respeta_starseed_root(self):
        """STARSEED_ROOT definido manda: RAIZ y RUTA_ASIGNACIONES cuelgan de él."""
        otra = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(otra, ignore_errors=True))
        raiz, ruta = self._recargar({"STARSEED_ROOT": otra})
        self.assertEqual(raiz, otra)
        self.assertEqual(
            ruta,
            os.path.join(otra, "starseed_memory_root", "mando", "asignaciones-agentes.json"),
        )


if __name__ == "__main__":
    unittest.main()
