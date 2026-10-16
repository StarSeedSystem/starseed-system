"""Pruebas unitarias para la lógica pura del oído Parakeet.

Estas pruebas no requieren el modelo de transcripción ni ningún recurso externo.
"""

from __future__ import annotations

import unittest

from .oido_logica import (
    ErrorValidacionSolicitud,
    formatear_respuesta,
    validar_y_normalizar_solicitud,
)


class TestOidoLogica(unittest.TestCase):
    """Casos de prueba para las funciones puras de oido_logica."""

    def test_formatear_respuesta(self) -> None:
        """Verifica que formatear_respuesta devuelve el diccionario esperado."""
        texto = "Hola, mundo."
        language = "es"
        esperado = {"text": texto, "language": language}
        self.assertEqual(formatear_respuesta(texto, language), esperado)

    def test_validar_y_normalizar_solicitud_exitoso(self) -> None:
        """Verifica la validación y normalización con datos correctos."""
        partes = {
            "file": b"dummy audio data",
            "model": "nemo-parakeet-tdt-0.6b-v3",
            "language": "es-MX",
        }
        audio_bytes, model_norm, language_norm = validar_y_normalizar_solicitud(partes)
        self.assertEqual(audio_bytes, b"dummy audio data")
        self.assertEqual(model_norm, "nemo-parakeet-tdt-0.6b-v3")
        self.assertEqual(language_norm, "es")  # Normalizado a es

    def test_validar_y_normalizar_solicitud_modelo_invalido(self) -> None:
        """Verifica que se lanza una excepción para un modelo no válido."""
        partes = {
            "file": b"dummy audio data",
            "model": "modelo-no-valido",
            "language": "es",
        }
        with self.assertRaises(ErrorValidacionSolicitud):
            validar_y_normalizar_solicitud(partes)

    def test_validar_y_normalizar_solicitud_falta_campo(self) -> None:
        """Verifica que se lanza una excepción cuando falta un campo obligatorio."""
        partes = {
            "file": b"dummy audio data",
            "model": "nemo-parakeet-tdt-0.6b-v3",
            # Falta 'language'
        }
        with self.assertRaises(ErrorValidacionSolicitud):
            validar_y_normalizar_solicitud(partes)

    def test_validar_y_normalizar_solicitud_idioma_vacio(self) -> None:
        """Verifica que se lanza una excepción cuando el idioma está vacío."""
        partes = {
            "file": b"dummy audio data",
            "model": "nemo-parakeet-tdt-0.6b-v3",
            "language": "",
        }
        with self.assertRaises(ErrorValidacionSolicitud):
            validar_y_normalizar_solicitud(partes)


if __name__ == "__main__":
    unittest.main()