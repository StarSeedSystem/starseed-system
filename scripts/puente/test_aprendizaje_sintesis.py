# -*- coding: utf-8 -*-
"""Pruebas para aprendizaje_sintesis.py (SIN1116E).

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

import aprendizaje_sintesis as A


class TestAprendizajeSintesis(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        # Monkeypatch las rutas
        A.RUTA_APRENDIZAJES = str(self.raiz / "sintesis-aprendizajes.md")
        A.RUTA_NOTAS_AGENTES = str(self.raiz / "notas-agentes.json")

    def tearDown(self):
        self.tmp.cleanup()

    def test_registrar_entrega_escribe_aprendizajes(self):
        aceptadas = [
            {"id": "rec-1", "texto": "Propuesta aceptada", "pieza_base": "sintesis", "filtro_novedad": {"motivo": "Novedad suficiente", "estado": "aceptada"}},
        ]
        descartadas = [
            {"id": "rec-2", "texto": "Propuesta descartada", "pieza_base": "filtro", "filtro_novedad": {"motivo": "Ya existe", "estado": "descartada"}},
        ]

        resultado = A.registrar_entrega(aceptadas, descartadas)

        self.assertTrue(resultado["entrada_escrita"])
        self.assertEqual(resultado["stats"]["total"], 2)
        self.assertEqual(resultado["stats"]["aceptadas"], 1)
        self.assertEqual(resultado["stats"]["descartadas"], 1)

        # Verificar que se escribió en el archivo
        contenido = Path(A.RUTA_APRENDIZAJES).read_text(encoding="utf-8")
        self.assertIn("Propuesta aceptada", contenido)
        self.assertIn("Propuesta descartada", contenido)

    def test_registrar_entrega_actualiza_notas_agente(self):
        aceptadas = [
            {"id": "rec-1", "texto": "Propuesta IA", "pieza_base": "sintesis_autonoma", "filtro_novedad": {"estado": "aceptada"}},
        ]
        descartadas = [
            {"id": "rec-2", "texto": "Propuesta duplicada", "pieza_base": "filtro_novedad", "filtro_novedad": {"estado": "descartada"}},
        ]
        agentes_info = {
            "investigador-ia": {
                "propuestas_aceptadas": aceptadas,
                "propuestas_descartadas": descartadas,
                "propuestas_todas": aceptadas + descartadas,
            }
        }

        A.registrar_entrega(aceptadas, descartadas, agentes_info)

        notas = A.obtener_notas_agente("investigador-ia")
        self.assertIn("sintesis_autonoma", notas["temas_fuertes"])
        self.assertIn("filtro_novedad", notas["temas_debiles"])
        self.assertEqual(notas["aceptadas"], 1)
        self.assertEqual(notas["total_propuestas"], 2)

    def test_obtener_notas_agente_inexistente(self):
        notas = A.obtener_notas_agente("agente-que-no-existe")
        self.assertEqual(notas, {})

    def test_obtener_todas_las_notas(self):
        A.registrar_entrega(
            [{"id": "r1", "texto": "t", "pieza_base": "a", "filtro_novedad": {"estado": "aceptada"}}],
            [],
            {"agente1": {"propuestas_aceptadas": [{"pieza_base": "a"}], "propuestas_descartadas": [], "propuestas_todas": []}}
        )
        A.registrar_entrega(
            [],
            [{"id": "r2", "texto": "t", "pieza_base": "b", "filtro_novedad": {"estado": "descartada"}}],
            {"agente2": {"propuestas_aceptadas": [], "propuestas_descartadas": [{"pieza_base": "b"}], "propuestas_todas": []}}
        )

        todas = A.obtener_todas_las_notas()
        self.assertIn("agente1", todas)
        self.assertIn("agente2", todas)

    def test_generar_contexto_para_agente(self):
        A.registrar_entrega(
            [{"id": "r1", "texto": "t", "pieza_base": "tema_fuerte", "filtro_novedad": {"estado": "aceptada"}}],
            [{"id": "r2", "texto": "t", "pieza_base": "tema_debil", "filtro_novedad": {"estado": "descartada"}}],
            {"mi-agente": {"propuestas_aceptadas": [{"pieza_base": "tema_fuerte"}], "propuestas_descartadas": [{"pieza_base": "tema_debil"}], "propuestas_todas": []}}
        )

        contexto = A.generar_contexto_para_agente("mi-agente")
        self.assertIn("tema_fuerte", contexto)
        self.assertIn("tema_debil", contexto)
        self.assertIn("Ratio de acierto", contexto)

    def test_generar_contexto_agente_sin_notas(self):
        contexto = A.generar_contexto_para_agente("agente-nuevo")
        self.assertEqual(contexto, "")

    def test_registrar_entrega_sin_agentes_info(self):
        """Debe funcionar sin agentes_info."""
        aceptadas = [{"id": "r1", "texto": "t", "pieza_base": "a", "filtro_novedad": {"estado": "aceptada"}}]
        descartadas = [{"id": "r2", "texto": "t", "pieza_base": "b", "filtro_novedad": {"estado": "descartada"}}]

        resultado = A.registrar_entrega(aceptadas, descartadas, agentes_info=None)
        self.assertEqual(resultado["notas_actualizadas"], [])

    def test_estadisticas_ampliaciones(self):
        aceptadas = [{"id": "r1", "texto": "t", "pieza_base": "a", "filtro_novedad": {"estado": "aceptada"}}]
        descartadas = [
            {"id": "r2", "texto": "t", "pieza_base": "b", "filtro_novedad": {"estado": "descartada"}},
            {"id": "r3", "texto": "t", "pieza_base": "c", "filtro_novedad": {"estado": "ampliacion"}},
        ]

        resultado = A.registrar_entrega(aceptadas, descartadas)
        self.assertEqual(resultado["stats"]["ampliaciones"], 1)
        self.assertEqual(resultado["stats"]["descartadas"], 1)

    def test_persistencia_notas_entre_llamadas(self):
        A.registrar_entrega(
            [{"id": "r1", "texto": "t", "pieza_base": "persistente", "filtro_novedad": {"estado": "aceptada"}}],
            [],
            {"agente-test": {"propuestas_aceptadas": [{"pieza_base": "persistente"}], "propuestas_descartadas": [], "propuestas_todas": []}}
        )

        # Simular recarga del módulo
        import importlib
        importlib.reload(A)
        A.RUTA_NOTAS_AGENTES = str(self.raiz / "notas-agentes.json")

        notas = A.obtener_notas_agente("agente-test")
        self.assertIn("persistente", notas["temas_fuertes"])

    def test_obtener_aprendizajes_recientes(self):
        A.registrar_entrega(
            [{"id": "r1", "texto": "Entrada 1", "pieza_base": "a", "filtro_novedad": {"estado": "aceptada"}}],
            [],
        )
        A.registrar_entrega(
            [{"id": "r2", "texto": "Entrada 2", "pieza_base": "b", "filtro_novedad": {"estado": "aceptada"}}],
            [],
        )

        recientes = A.obtener_aprendizajes_recientes(lineas=100)
        self.assertIn("Entrada 1", recientes)
        self.assertIn("Entrada 2", recientes)

    def test_formatear_entrada_aprendizaje(self):
        """Prueba la función interna de formateo."""
        fecha = "2026-11-18 10:30"
        aceptadas = [{"id": "r1", "texto": "Aceptada", "pieza_base": "a", "filtro_novedad": {"motivo": "Novedad", "estado": "aceptada"}}]
        descartadas = [{"id": "r2", "texto": "Descartada", "pieza_base": "b", "filtro_novedad": {"motivo": "Duplicada", "estado": "descartada"}}]
        stats = {"total": 2, "aceptadas": 1, "descartadas": 1, "ampliaciones": 0}

        entrada = A._formatear_entrada_aprendizaje(fecha, aceptadas, descartadas, stats)
        self.assertIn("2026-11-18 10:30", entrada)
        self.assertIn("Aceptada", entrada)
        self.assertIn("Descartada", entrada)
        self.assertIn("Novedad", entrada)
        self.assertIn("Duplicada", entrada)


if __name__ == "__main__":
    unittest.main()