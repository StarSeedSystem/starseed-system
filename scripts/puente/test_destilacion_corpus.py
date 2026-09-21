#!/usr/bin/env python3
"""
scripts/puente/test_destilacion_corpus.py
Pruebas unitarias para destilacion_corpus.py.
"""

import unittest
from scripts.puente.destilacion_corpus import (
    limpiar_sensibles,
    ejemplo_de_tarea,
    recoger
)

class TestDestilacionCorpus(unittest.TestCase):
    """Pruebas de filtrado, aceptación de tareas y recolección sin duplicados."""

    def test_ejemplo_commit_limpio(self):
        """Comprueba que una tarea en commit con revisión limpia es aceptada."""
        tarea = {"id": "TK1", "prompt": "Crear un módulo helper", "area": "mando"}
        entrada = {
            "estado": "commit",
            "sha": "a1b2c3d4e5f6",
            "modelo": "gemini-3.6-flash",
            "revision": {"bloqueante": False, "ok": True}
        }
        diff = "diff --git a/file.py b/file.py\n+def foo(): pass"

        ejemplo = ejemplo_de_tarea(tarea, entrada, diff)
        self.assertIsNotNone(ejemplo)
        self.assertEqual(ejemplo["encargo"], "Crear un módulo helper")
        self.assertEqual(ejemplo["sha"], "a1b2c3d4e5f6")
        self.assertEqual(ejemplo["modelo"], "gemini-3.6-flash")
        self.assertEqual(ejemplo["area"], "mando")

    def test_ejemplo_tarea_rechazada(self):
        """Comprueba que una tarea rechazada no entra en el corpus."""
        tarea = {"id": "TK2", "prompt": "Tarea defectuosa", "area": "mando"}
        entrada = {
            "estado": "rechazada",
            "sha": "1234567890ab",
            "revision": {"bloqueante": True}
        }
        ejemplo = ejemplo_de_tarea(tarea, entrada, "diff de prueba")
        self.assertIsNone(ejemplo)

    def test_ejemplo_revision_bloqueante(self):
        """Comprueba que una tarea con revisión bloqueante es descartada."""
        tarea = {"id": "TK3", "prompt": "Tarea con objeción grave"}
        entrada = {
            "estado": "commit",
            "sha": "abcdef123456",
            "revision": {"bloqueante": True, "detalles": "Error de arquitectura"}
        }
        ejemplo = ejemplo_de_tarea(tarea, entrada, "diff con error")
        self.assertIsNone(ejemplo)

        entrada_str = {
            "estado": "commit",
            "sha": "abcdef654321",
            "revision": "Revisión bloqueante por fallos de seguridad"
        }
        self.assertIsNone(ejemplo_de_tarea(tarea, entrada_str, "diff"))

    def test_recoger_sin_duplicados_sha(self):
        """Comprueba que recoger elimina duplicados con el mismo sha."""
        tareas = {
            "TK1": {"id": "TK1", "prompt": "Tarea uno", "area": "mando"},
            "TK2": {"id": "TK2", "prompt": "Tarea dos (duplicada)", "area": "mando"},
            "TK3": {"id": "TK3", "prompt": "Tarea tres", "area": "core"}
        }
        progreso = {
            "TK1": {"estado": "commit", "sha": "sha_compartido", "modelo": "gemini-3.6-flash"},
            "TK2": {"estado": "commit", "sha": "sha_compartido", "modelo": "gpt-5.6-sol"},
            "TK3": {"estado": "commit", "sha": "sha_unico", "modelo": "kimi-k3"}
        }

        def mock_leer_diff(sha):
            return f"diff mock para {sha}"

        ejemplos = recoger(progreso, tareas, mock_leer_diff)
        self.assertEqual(len(ejemplos), 2)
        shas = [e["sha"] for e in ejemplos]
        self.assertEqual(sorted(shas), ["sha_compartido", "sha_unico"])

    def test_filtrado_claves_y_secretos(self):
        """Comprueba que las líneas con claves, tokens y secretos son filtradas."""
        diff_sucio = (
            "diff --git a/config.py b/config.py\n"
            "+DEBUG = True\n"
            "+API_KEY = 'sk-1234567890abcdef'\n"
            "+GITHUB_TOKEN=ghp_secrettokenvalue\n"
            "+DB_PASSWORD = admin123\n"
            "+MY_SECRET = 's3cr3t'\n"
            "+URL = 'https://example.com'\n"
        )

        limpio = limpiar_sensibles(diff_sucio)
        self.assertNotIn("sk-1234567890abcdef", limpio)
        self.assertNotIn("ghp_secrettokenvalue", limpio)
        self.assertNotIn("admin123", limpio)
        self.assertNotIn("s3cr3t", limpio)
        self.assertIn("+DEBUG = True", limpio)
        self.assertIn("+URL = 'https://example.com'", limpio)
        self.assertIn("[FILTRADO:", limpio)

        tarea = {"id": "TK4", "prompt": "Guardar config"}
        entrada = {"estado": "commit", "sha": "sha_secretos"}
        ejemplo = ejemplo_de_tarea(tarea, entrada, diff_sucio)
        self.assertIsNotNone(ejemplo)
        self.assertNotIn("sk-1234567890abcdef", ejemplo["respuesta"])
        self.assertNotIn("ghp_secrettokenvalue", ejemplo["respuesta"])

if __name__ == "__main__":
    unittest.main()
