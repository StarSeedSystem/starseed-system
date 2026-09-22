"""Pruebas sin red para el enrutado de Jev."""

from __future__ import annotations

import unittest
from collections.abc import Mapping, Sequence
from typing import Any, Tuple

from jev_enrutado import elegir_medio, ficha_de_tarea, motivo_legible


class JevMock:
    """Mock de Jev para pruebas."""
    
    def __init__(self, respuesta: Tuple[str, dict, float] | None = None):
        self.respuesta = respuesta
        self.llamadas = 0
    
    def elegir(
        self, 
        estado: Mapping[str, Any], 
        pregunta: str, 
        opciones: Mapping[str, str], 
        nombre: str
    ) -> Tuple[str, dict, float] | None:
        self.llamadas += 1
        return self.respuesta


class TestFichaDeTarea(unittest.TestCase):
    """Pruebas para la función ficha_de_tarea."""
    
    def test_tarea_basica(self):
        """Prueba con una tarea básica."""
        tarea = {
            "titulo": "Corregir el enrutador",
            "archivos": ["scripts/puente/jev_enrutado.py", "src/panel.tsx"],
            "pruebas": True,
        }
        resultado = ficha_de_tarea(tarea)
        self.assertIn("Corregir el enrutador", resultado)
        self.assertIn("Archivos: 2", resultado)
        self.assertIn("(py, tsx)", resultado)
        self.assertIn("Lenguaje: TypeScript", resultado)
        self.assertIn("Pruebas: sí", resultado)
    
    def test_tarea_python(self):
        """Prueba con una tarea de Python."""
        tarea = {
            "titulo": "Optimizar algoritmo",
            "archivos": ["scripts/optimizacion.py", "utils/helpers.py"],
            "pruebas": False,
        }
        resultado = ficha_de_tarea(tarea)
        self.assertIn("Optimizar algoritmo", resultado)
        self.assertIn("Archivos: 2", resultado)
        self.assertIn("(py)", resultado)
        self.assertIn("Lenguaje: Python", resultado)
        self.assertIn("Pruebas: no", resultado)
    
    def test_tarea_sin_extension(self):
        """Prueba con archivos sin extensión."""
        tarea = {
            "titulo": "Actualizar documentación",
            "archivos": ["README", "LICENSE"],
            "pruebas": False,
        }
        resultado = ficha_de_tarea(tarea)
        self.assertIn("Actualizar documentación", resultado)
        self.assertIn("Archivos: 2", resultado)
        self.assertIn("sin extensión", resultado)
        self.assertIn("Lenguaje: otro", resultado)
        self.assertIn("Pruebas: no", resultado)
    
    def test_tarea_con_lineas(self):
        """Prueba con especificación de líneas."""
        tarea = {
            "titulo": "Refactorizar componente",
            "archivos": ["src/components/Button.tsx"],
            "lineas": 120,
            "pruebas": True,
        }
        resultado = ficha_de_tarea(tarea)
        self.assertIn("Refactorizar componente", resultado)
        self.assertIn("Archivos: 1", resultado)
        self.assertIn("(tsx)", resultado)
        self.assertIn("120 líneas", resultado)
        self.assertIn("Lenguaje: TypeScript", resultado)
        self.assertIn("Pruebas: sí", resultado)
    
    def test_tarea_detecta_pruebas_en_descripcion(self):
        """Prueba que detecta pruebas en la descripción."""
        tarea = {
            "titulo": "Nuevo feature",
            "archivos": ["src/feature.ts"],
            "descripcion": "Implementar el feature y escribir pruebas unitarias",
        }
        resultado = ficha_de_tarea(tarea)
        self.assertIn("Pruebas: sí", resultado)


class TestElegirMedio(unittest.TestCase):
    """Pruebas para la función elegir_medio."""
    
    def test_cero_candidatos(self):
        """Prueba con cero candidatos."""
        tarea = {"titulo": "Tarea de prueba"}
        medio, motivo = elegir_medio(tarea, [])
        self.assertEqual(medio, "")
        self.assertEqual(motivo, "sin candidatos disponibles")
    
    def test_un_candidato_sin_jev(self):
        """Prueba con un candidato sin Jev proporcionado."""
        tarea = {"titulo": "Tarea de prueba"}
        medio, motivo = elegir_medio(tarea, ["openrouter/gemini-flash"])
        self.assertEqual(medio, "openrouter/gemini-flash")
        self.assertEqual(motivo, "único candidato disponible")
    
    def test_un_candidato_con_jev_no_se_llama(self):
        """Prueba que con un candidato no se llama a Jev."""
        tarea = {"titulo": "Tarea de prueba"}
        jev_mock = JevMock(("opcion_0", {"opcion_0": 1.0}, 0.9))
        medio, motivo = elegir_medio(tarea, ["openrouter/gemini-flash"], jev=jev_mock)
        self.assertEqual(medio, "openrouter/gemini-flash")
        self.assertEqual(motivo, "único candidato disponible")
        self.assertEqual(jev_mock.llamadas, 0)  # Jev no debería haber sido llamado
    
    def test_varios_candidatos_jev_devuelve_none(self):
        """Prueba con varios candidatos y Jev devuelve None."""
        tarea = {"titulo": "Tarea de prueba"}
        jev_mock = JevMock(None)  # Jev no decide
        medio, motivo = elegir_medio(
            tarea, 
            ["openrouter/gemini-flash", "nvidia/nemotron", "xkiro/qwen"], 
            jev=jev_mock
        )
        self.assertEqual(medio, "openrouter/gemini-flash")  # Primer candidato
        self.assertIn("Jev no pudo decidir", motivo)
        self.assertEqual(jev_mock.llamadas, 1)
    
    def test_varios_candidatos_jev_elige_tercero(self):
        """Prueba con varios candidatos y Jev elige el tercero."""
        tarea = {"titulo": "Tarea de prueba"}
        # Jev elige la opción "opcion_2" (tercero, índice 2)
        jev_mock = JevMock(("opcion_2", {"opcion_2": 0.8}, 0.85))
        medio, motivo = elegir_medio(
            tarea, 
            ["openrouter/gemini-flash", "nvidia/nemotron", "xkiro/qwen", "aihubmix/model"],
            jev=jev_mock
        )
        self.assertEqual(medio, "xkiro/qwen")  # Tercero candidato
        self.assertIn("Jev eligió xkiro/qwen", motivo)
        self.assertEqual(jev_mock.llamadas, 1)
    
    def test_varios_candidatos_jev_exception(self):
        """Prueba que si Jev lanza excepción se cae al determinista."""
        tarea = {"titulo": "Tarea de prueba"}
        
        class JevConError:
            def elegir(self, estado, pregunta, opciones, nombre):
                raise RuntimeError("Error de red")
        
        jev_mock = JevConError()
        medio, motivo = elegir_medio(
            tarea, 
            ["openrouter/gemini-flash", "nvidia/nemotron"], 
            jev=jev_mock
        )
        self.assertEqual(medio, "openrouter/gemini-flash")
        self.assertIn("Error al consultar a Jev", motivo)
    
    def test_cinco_candidatos_limite_a_cuatro(self):
        """Prueba que solo se consideran los primeros cuatro candidatos."""
        tarea = {"titulo": "Tarea de prueba"}
        jev_mock = JevMock(("opcion_3", {"opcion_3": 0.9}, 0.9))  # Elige el cuarto
        medio, motivo = elegir_medio(
            tarea, 
            [
                "openrouter/gemini-flash", 
                "nvidia/nemotron", 
                "xkiro/qwen", 
                "aihubmix/model",
                "extra/quinto"  # Este no debería considerarse
            ], 
            jev=jev_mock
        )
        self.assertEqual(medio, "aihubmix/model")  # Cuarto candidato
        self.assertEqual(jev_mock.llamadas, 1)


class TestMotivoLegible(unittest.TestCase):
    """Pruebas para la función motivo_legible."""
    
    def test_motivo_basico(self):
        """Prueba motivo básico."""
        resultado = motivo_legible("gemini-3.6-flash", "Jev: 3 archivos TypeScript con pruebas")
        self.assertEqual(resultado, "Tarea -> gemini-3.6-flash (Jev: 3 archivos TypeScript con pruebas)")
    
    def test_motivo_vacio(self):
        """Prueba con motivo vacío."""
        resultado = motivo_legible("modelo", "")
        self.assertEqual(resultado, "Tarea -> modelo ()")


if __name__ == "__main__":
    unittest.main(verbosity=2)