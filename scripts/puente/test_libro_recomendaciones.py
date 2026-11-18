# -*- coding: utf-8 -*-
"""Pruebas para libro_recomendaciones.py (SIN1116E).

Pruebas TDD: escribe primero una prueba que falle y luego solo el código
justo para pasarla. Una costura, una prueba y una implementación mínima
por ciclo.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import libro_recomendaciones as L


class TestLibroRecomendaciones(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        # Monkeypatch la ruta
        L.RUTA_RECOMENDACIONES = str(self.raiz / "recomendaciones.jsonl")

    def tearDown(self):
        self.tmp.cleanup()

    def test_crear_recomendacion_genera_id(self):
        rec = L.crear_recomendacion("Texto de prueba", "ia", "pieza_base")
        self.assertIn("id", rec)
        self.assertTrue(rec["id"].startswith("rec-"))
        self.assertEqual(rec["estado"], "propuesta")
        self.assertEqual(rec["texto"], "Texto de prueba")
        self.assertEqual(rec["area"], "ia")
        self.assertEqual(rec["pieza_base"], "pieza_base")

    def test_crear_reconmmendacion_con_id_personalizado(self):
        rec = L.crear_recomendacion("Texto", "ia", "base", id_propuesta="rec-custom-123")
        self.assertEqual(rec["id"], "rec-custom-123")

    def test_obtener_recomendacion_existente(self):
        rec = L.crear_recomendacion("Texto", "ia", "base", id_propuesta="rec-test-001")
        obtenida = L.obtener_recomendacion("rec-test-001")
        self.assertIsNotNone(obtenida)
        self.assertEqual(obtenida["id"], "rec-test-001")
        self.assertEqual(obtenida["texto"], "Texto")

    def test_obtener_recomendacion_inexistente(self):
        self.assertIsNone(L.obtener_recomendacion("rec-no-existe"))

    def test_actualizar_estado_valido(self):
        L.crear_recomendacion("Texto", "ia", "base", id_propuesta="rec-test-001")
        actualizada = L.actualizar_estado("rec-test-001", "aprobada")
        self.assertIsNotNone(actualizada)
        self.assertEqual(actualizada["estado"], "aprobada")
        self.assertIn("fecha_actualizacion", actualizada)

    def test_actualizar_estado_invalido_normaliza_a_propuesta(self):
        L.crear_recomendacion("Texto", "ia", "base", id_propuesta="rec-test-001")
        actualizada = L.actualizar_estado("rec-test-001", "estado_invalido")
        self.assertEqual(actualizada["estado"], "propuesta")

    def test_actualizar_estado_inexistente(self):
        self.assertIsNone(L.actualizar_estado("rec-no-existe", "aprobada"))

    def test_listar_todas(self):
        L.crear_recomendacion("Primera", "ia", "base", id_propuesta="rec-1")
        L.crear_recomendacion("Segunda", "diseno", "base", id_propuesta="rec-2")
        items = L.listar_recomendaciones()
        self.assertEqual(len(items), 2)
        # Más reciente primero
        self.assertEqual(items[0]["id"], "rec-2")

    def test_listar_filtrar_por_estado(self):
        L.crear_recomendacion("Propuesta", "ia", "base", id_propuesta="rec-1")
        L.crear_recomendacion("Aprobada", "ia", "base", id_propuesta="rec-2")
        L.actualizar_estado("rec-2", "aprobada")

        propuestas = L.listar_recomendaciones(estado="propuesta")
        self.assertEqual(len(propuestas), 1)
        self.assertEqual(propuestas[0]["id"], "rec-1")

        aprobadas = L.listar_recomendaciones(estado="aprobada")
        self.assertEqual(len(aprobadas), 1)
        self.assertEqual(aprobadas[0]["id"], "rec-2")

    def test_listar_filtrar_por_area(self):
        L.crear_recomendacion("IA", "ia", "base", id_propuesta="rec-1")
        L.crear_recomendacion("Diseño", "diseno", "base", id_propuesta="rec-2")

        ia_items = L.listar_recomendaciones(area="ia")
        self.assertEqual(len(ia_items), 1)
        self.assertEqual(ia_items[0]["id"], "rec-1")

    def test_listar_con_limite(self):
        for i in range(5):
            L.crear_recomendacion(f"Item {i}", "ia", "base", id_propuesta=f"rec-{i}")
        items = L.listar_recomendaciones(limite=3)
        self.assertEqual(len(items), 3)

    def test_actualizar_estados_desde_chat(self):
        L.crear_recomendacion("Texto 1", "ia", "base", id_propuesta="rec-1")
        L.crear_recomendacion("Texto 2", "ia", "base", id_propuesta="rec-2")
        L.crear_recomendacion("Texto 3", "ia", "base", id_propuesta="rec-3")

        respuestas = [
            {"id": "rec-1", "accion": "aprobar"},
            {"id": "rec-2", "accion": "rechazar"},
            {"id": "rec-3", "accion": "ya_existe"},
        ]
        actualizadas = L.actualizar_estados_desde_chat(respuestas)
        self.assertEqual(actualizadas, 3)

        self.assertEqual(L.obtener_recomendacion("rec-1")["estado"], "aprobada")
        self.assertEqual(L.obtener_recomendacion("rec-2")["estado"], "rechazada")
        self.assertEqual(L.obtener_recomendacion("rec-3")["estado"], "ya_existe")

    def test_actualizar_estados_desde_chat_acciones_variadas(self):
        L.crear_recomendacion("Texto", "ia", "base", id_propuesta="rec-1")
        # Diferentes formas de escribir la acción
        for accion in ["aprobar", "aprobada", "Aprobar", "APROBAR"]:
            L.actualizar_estado("rec-1", "propuesta")  # Reset
            L.actualizar_estados_desde_chat([{"id": "rec-1", "accion": accion}])
            self.assertEqual(L.obtener_recomendacion("rec-1")["estado"], "aprobada")

    def test_actualizar_estados_desde_commits(self):
        L.crear_recomendacion("Texto 1", "ia", "base", id_propuesta="rec-abc12345")
        L.crear_recomendacion("Texto 2", "ia", "base", id_propuesta="rec-def67890")

        commits = [
            {"mensaje": "feat: implementar rec-abc12345", "sha": "sha1"},
            {"mensaje": "fix: otro cambio", "sha": "sha2"},
        ]
        actualizadas = L.actualizar_estados_desde_commits(commits)
        self.assertEqual(actualizadas, 1)
        self.assertEqual(L.obtener_recomendacion("rec-abc12345")["estado"], "integrada")
        self.assertEqual(L.obtener_recomendacion("rec-abc12345")["commit_sha"], "sha1")
        self.assertEqual(L.obtener_recomendacion("rec-def67890")["estado"], "propuesta")

    def test_actualizar_estados_desde_commits_multiples_ids(self):
        L.crear_recomendacion("Texto 1", "ia", "base", id_propuesta="rec-aaa11111")
        L.crear_recomendacion("Texto 2", "ia", "base", id_propuesta="rec-bbb22222")

        commits = [
            {"mensaje": "merge rec-aaa11111 y rec-bbb22222", "sha": "sha1"},
        ]
        actualizadas = L.actualizar_estados_desde_commits(commits)
        self.assertEqual(actualizadas, 2)

    def test_estadisticas(self):
        L.crear_recomendacion("P1", "ia", "base", id_propuesta="rec-1")
        L.crear_recomendacion("P2", "ia", "base", id_propuesta="rec-2")
        L.crear_recomendacion("P3", "ia", "base", id_propuesta="rec-3")
        L.actualizar_estado("rec-2", "aprobada")
        L.actualizar_estado("rec-3", "rechazada")

        stats = L.estadisticas()
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["propuesta"], 1)
        self.assertEqual(stats["aprobada"], 1)
        self.assertEqual(stats["rechazada"], 1)
        self.assertEqual(stats["ya_existe"], 0)
        self.assertEqual(stats["encargada"], 0)
        self.assertEqual(stats["integrada"], 0)

    def test_persistencia_entre_llamadas(self):
        L.crear_recomendacion("Persistente", "ia", "base", id_propuesta="rec-persist")
        # Nueva instancia (simulando recarga)
        import importlib
        importlib.reload(L)
        L.RUTA_RECOMENDACIONES = str(self.raiz / "recomendaciones.jsonl")

        rec = L.obtener_recomendacion("rec-persist")
        self.assertIsNotNone(rec)
        self.assertEqual(rec["texto"], "Persistente")


if __name__ == "__main__":
    unittest.main()