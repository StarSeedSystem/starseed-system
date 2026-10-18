"""Pruebas para el módulo servir_transcodificar.

Estas pruebas verifican la generación de órdenes de ffmpeg y la ejecución
segura de la transcodificación sin realmente llamar a ffmpeg.
"""

import unittest
from unittest.mock import patch, MagicMock
import os

# Import the module to test
from scripts.puente.servir_transcodificar import (
    ordenes_escalera,
    transcodificar
)


class TestServirTranscodificar(unittest.TestCase):
    """Caso de prueba para las funciones de transcodificación."""

    def setUp(self):
        """Configuración común para las pruebas."""
        self.entrada = "video_de_entrada.mp4"
        self.salida_dir = "/tmp/salida_hls"
        self.alturas = (1080, 720, 480, 240)

    def test_ordenes_escalera_retorna_lista_no_vacia(self):
        """Verifica que la función retorne una lista no vacía."""
        comandos = ordenes_escalera(self.entrada, self.salida_dir, self.alturas)
        self.assertIsInstance(comandos, list)
        self.assertGreater(len(comandos), 0)
        # Esperamos una sola orden (una lista de argumentos)
        self.assertEqual(len(comandos), 1)
        self.assertIsInstance(comandos[0], list)
        self.assertGreater(len(comandos[0]), 0)

    def test_ordenes_escalera_contiene_ffmpeg(self):
        """Verifica que la orden contenga el ejecutable ffmpeg."""
        comandos = ordenes_escalera(self.entrada, self.salida_dir, self.alturas)
        self.assertEqual(comandos[0][0], "ffmpeg")

    def test_ordenes_escalera_contiene_entrada_y_salida(self):
        """Verifica que la orden contenga la ruta de entrada y el directorio de salida."""
        comandos = ordenes_escalera(self.entrada, self.salida_dir, self.alturas)
        cmd_str = " ".join(comandos[0])
        self.assertIn(self.entrada, cmd_str)
        self.assertIn(self.salida_dir, cmd_str)

    def test_ordenes_escalera_alturas_procesadas(self):
        """Verifica que se procesen todas las alturas proporcionadas."""
        comandos = ordenes_escalera(self.entrada, self.salida_dir, self.alturas)
        cmd_str = " ".join(comandos[0])
        for altura in self.alturas:
            # Cada altura debería aparecer en la opción de escala
            self.assertIn(f"scale=-2:{altura}", cmd_str)

    def test_ordenes_escalera_altura_superior_no_procesada(self):
        """Verifica que una altura superior a las predeterminadas se procese si se proporciona."""
        # Esta prueba asume que la función no filtra alturas (responsabilidad del llamador)
        alturas = (1080, 720, 480, 240, 1440)
        comandos = ordenes_escalera(self.entrada, self.salida_dir, alturas)
        cmd_str = " ".join(comandos[0])
        self.assertIn("scale=-2:1440", cmd_str)

    @patch("scripts.puente.servir_transcodificar.shutil.which")
    def test_transcodificar_ffmpeg_no_encontrado(self, mock_which):
        """Verifica que se devuelva un error claro si ffmpeg no está disponible."""
        mock_which.return_value = None
        éxito, mensaje = transcodificar(
            self.entrada,
            self.salida_dir,
            lambda cmd, timeout: (0, "", ""),  # ejecutor mockeado que siempre tiene éxito
        )
        self.assertFalse(éxito)
        self.assertIn("ffmpeg no encontrado", mensaje)

    def test_transcodificar_ejecucion_exitosa(self):
        """Verifica que la transcodificación se ejecute correctamente con un mockeado."""
        # Mocamos shutil.which para que devuelva una ruta falsa de ffmpeg
        with patch("scripts.puente.servir_transcodificar.shutil.which") as mock_which:
            mock_which.return_value = "/usr/bin/ffmpeg"
            # Mocamos el ejecutor para que devuelva éxito
            mock_ejecutor = MagicMock(return_value=(0, "stdout", "stderr"))
            éxito, mensaje = transcodificar(
                self.entrada,
                self.salida_dir,
                mock_ejecutor,
                timeout=10.0
            )
            self.assertTrue(éxito)
            self.assertEqual(mensaje, "Transcodificación completada exitosamente")
            # Verificamos que el ejecutor haya sido llamado con una lista de argumentos y un timeout
            mock_ejecutor.assert_called_once()
            args, kwargs = mock_ejecutor.call_args
            self.assertIsInstance(args[0], list)
            self.assertEqual(args[1], 10.0)

    def test_transcodificar_error_ejecucion(self):
        """Verifica que se maneje un error de ejecución de ffmpeg."""
        with patch("scripts.puente.servir_transcodificar.shutil.which") as mock_which:
            mock_which.return_value = "/usr/bin/ffmpeg"
            # Mocamos el ejecutor para que devuelva un error
            mock_ejecutor = MagicMock(return_value=(1, "stdout", "ffmpeg error"))
            éxito, mensaje = transcodificar(
                self.entrada,
                self.salida_dir,
                mock_ejecutor,
                timeout=10.0
            )
            self.assertFalse(éxito)
            self.assertIn("ffmpeg devolvió código de error", mensaje)

    def test_transcodificar_exception_en_ejecutor(self):
        """Verifica que se maneje una excepción en el ejecutor."""
        with patch("scripts.puente.servir_transcodificar.shutil.which") as mock_which:
            mock_which.return_value = "/usr/bin/ffmpeg"
            # Mocamos el ejecutor para que lance una excepción
            mock_ejecutor = MagicMock(side_effect=Exception("error inesperado"))
            éxito, mensaje = transcodificar(
                self.entrada,
                self.salida_dir,
                mock_ejecutor,
                timeout=10.0
            )
            self.assertFalse(éxito)
            self.assertIn("Error al ejecutar la transcodificación", mensaje)


if __name__ == "__main__":
    unittest.main()