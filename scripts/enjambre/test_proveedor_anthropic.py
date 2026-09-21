"""Pruebas del catálogo y los escalones de Anthropic."""

import unittest

from proveedor_anthropic import cabeceras_api, escalon, ordenar_por_precio


class ProveedorAnthropicTest(unittest.TestCase):
    def test_ordenar_por_precio(self):
        modelos = [
            {
                "id": "claude-sonnet-4-20250514",
                "display_name": "Claude Sonnet 4",
                "created_at": "2025-05-14T00:00:00Z",
            },
            {
                "id": "claude-opus-4-20250522",
                "display_name": "Claude Opus 4",
                "created_at": "2025-05-22T00:00:00Z",
            },
            {
                "id": "claude-haiku-3-20240307",
                "display_name": "Claude 3 Haiku",
                "created_at": "2024-03-07T00:00:00Z",
            },
            {
                "id": "claude-haiku-4-20251001",
                "display_name": "Claude Haiku 4",
                "created_at": "2025-10-01T00:00:00Z",
            },
            {
                "id": "claude-sonnet-4-5-20250929",
                "display_name": "Claude Sonnet 4.5",
                "created_at": "2025-09-29T00:00:00Z",
            },
        ]
        self.assertEqual(
            ordenar_por_precio(modelos),
            [
                "claude-haiku-4-20251001",
                "claude-haiku-3-20240307",
                "claude-sonnet-4-5-20250929",
                "claude-sonnet-4-20250514",
                "claude-opus-4-20250522",
            ],
        )

    def test_escalones(self):
        ids = ["claude-haiku-4", "claude-sonnet-4", "claude-opus-4"]
        self.assertEqual(escalon(1, ids), "claude-haiku-4")
        self.assertEqual(escalon(2, ids), "claude-sonnet-4")
        self.assertIsNone(escalon(3, ids))

    def test_ignora_familias_desconocidas_y_subcadenas(self):
        modelos = [
            {"id": "claude-haikubot-1", "created_at": "2026-01-01T00:00:00Z"},
            {"id": "claude-futura-1", "created_at": "2026-01-01T00:00:00Z"},
        ]
        self.assertEqual(ordenar_por_precio(modelos), [])
        self.assertIsNone(escalon(1, ["claude-haikubot-1"]))

    def test_cabeceras_nativas_sin_bearer(self):
        cabeceras = cabeceras_api("CLAVE_DE_PRUEBA", contenido=True)
        self.assertEqual(cabeceras["x-api-key"], "CLAVE_DE_PRUEBA")
        self.assertEqual(cabeceras["anthropic-version"], "2023-06-01")
        self.assertEqual(cabeceras["Content-Type"], "application/json")
        self.assertNotIn("Authorization", cabeceras)


if __name__ == "__main__":
    unittest.main()
