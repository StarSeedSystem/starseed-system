"""Pruebas unitarias para scripts/puente/jev_enrutado.py."""

import unittest
from unittest.mock import patch
from scripts.puente.jev_enrutado import (
    disponible,
    enrutar,
    texto_de_tarea,
)


class TestJevEnrutado(unittest.TestCase):
    """Casos de prueba para las funciones del módulo jev_enrutado."""

    def test_texto_de_tarea_pura(self):
        """Prueba la conversión pura de tarea a prompt corto."""
        tarea = {
            "titulo": "Implementar módulo X",
            "archivos": ["src/lib/foo.ts", "src/lib/bar.tsx"],
            "prompt": "Crear el componente con vitest tests",
        }
        res = texto_de_tarea(tarea)
        self.assertIn("Implementar módulo X", res)
        self.assertIn("2", res)
        self.assertIn(".ts", res)
        self.assertIn(".tsx", res)
        self.assertIn("Pruebas: sí", res)

    def test_enrutar_respuesta_buena(self):
        """Prueba respuesta exitosa de jevkit con enrutado válido."""
        tarea = {"titulo": "Tarea de prueba", "archivos": ["test.py"]}
        modelo_actual = "openrouter/google/gemini-3.6-flash"

        def correr_fake(cmd):
            # Simulamos respuesta exitosa de jev route con proveedor 'openrouter'
            return (
                0,
                '{"routed": true, "model": "openrouter:kwaipilot/kat-coder-pro-v2.5", "reason": "medium coding"}',
                "",
            )

        nuevo_modelo, motivo = enrutar(tarea, modelo_actual, correr=correr_fake)
        self.assertEqual(nuevo_modelo, "openrouter/kwaipilot/kat-coder-pro-v2.5")
        self.assertEqual(motivo, "medium coding")

    def test_enrutar_routed_false(self):
        """Prueba jevkit respondiendo routed: false."""
        tarea = {"titulo": "Tarea simple", "archivos": []}
        modelo_actual = "xkiro/qwen3-coder-plus"

        def correr_fake(cmd):
            # Simulamos respuesta donde no hace falta re-enrutar
            return 0, '{"routed": false, "reason": "el modelo actual es adecuado"}', ""

        nuevo_modelo, motivo = enrutar(tarea, modelo_actual, correr=correr_fake)
        self.assertEqual(nuevo_modelo, modelo_actual)
        self.assertEqual(motivo, "el modelo actual es adecuado")

    def test_enrutar_json_roto(self):
        """Prueba comportamiento cuando jevkit devuelve JSON malformado."""
        tarea = {"titulo": "Tarea con JSON roto"}
        modelo_actual = "nim/kimi-k3"

        def correr_fake(cmd):
            # Simulamos salida no JSON / corrupta
            return 0, "ERROR: no se pudo parsear {json", ""

        nuevo_modelo, motivo = enrutar(tarea, modelo_actual, correr=correr_fake)
        self.assertEqual(nuevo_modelo, modelo_actual)
        self.assertIn("JSON no válida", motivo)

    def test_enrutar_tiempo_agotado(self):
        """Prueba comportamiento cuando jevkit lanza excepción de tiempo agotado."""
        tarea = {"titulo": "Tarea lenta"}
        modelo_actual = "nim/deepseek-v4-flash"

        def correr_fake(cmd):
            # Simulamos timeout excedido
            raise TimeoutError("Command timed out after 10 seconds")

        nuevo_modelo, motivo = enrutar(tarea, modelo_actual, correr=correr_fake)
        self.assertEqual(nuevo_modelo, modelo_actual)
        self.assertIn("Excepción", motivo)

    def test_enrutar_proveedor_desconocido(self):
        """Prueba comportamiento cuando jevkit sugiere un proveedor no permitido."""
        tarea = {"titulo": "Tarea compleja"}
        modelo_actual = "aihubmix/coding-glm-5.3-free"

        def correr_fake(cmd):
            # Simulamos que jevkit sugiere un proveedor no contemplado
            return (
                0,
                '{"routed": true, "model": "proveedor_raro:modelo-x", "reason": "hard coding"}',
                "",
            )

        nuevo_modelo, motivo = enrutar(tarea, modelo_actual, correr=correr_fake)
        self.assertEqual(nuevo_modelo, modelo_actual)
        self.assertEqual(motivo, "hard coding")

    def test_disponible(self):
        """Prueba la verificación de disponibilidad de jevkit."""
        with patch.dict("os.environ", {}, clear=True):
            # Sin la variable de entorno debe retornar False
            self.assertFalse(disponible())

        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "sk-or-fake-key"}):
            with patch("subprocess.run") as mock_run:
                mock_run.return_value.returncode = 0
                self.assertTrue(disponible())

                mock_run.return_value.returncode = 1
                self.assertFalse(disponible())


if __name__ == "__main__":
    unittest.main()
