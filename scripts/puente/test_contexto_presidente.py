# -*- coding: utf-8 -*-
"""Pruebas de armar_contexto y _contexto del cartero (CTX1118A).

Verifica: orden de prioridad, topes por parte y total, archivos ausentes.
Nada de red; lógica pura con carpetas temporales.
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cartero_director as C


class TestArmarContexto(unittest.TestCase):
    """Pruebas de la función pura armar_contexto."""

    def test_orden_prioridad_y_topes_parte(self):
        partes = [
            ("A", "a" * 5000, 2000),
            ("B", "b" * 3000, 2000),
            ("C", "c" * 1000, 2000),
        ]
        resultado = C.armar_contexto(partes, 5000)
        # A se recorta a 2000, B a 2000, C entra (lo que quepa tras separadores)
        self.assertIn("=== A ===", resultado)
        self.assertIn("=== B ===", resultado)
        self.assertIn("=== C ===", resultado)
        self.assertLessEqual(len(resultado), 5000)
        # A y B recortados a su tope
        self.assertTrue(resultado.count("a") <= 2000)
        self.assertTrue(resultado.count("b") <= 2000)
        # C obtiene lo que queda (puede ser < 1000 por separadores)
        self.assertTrue(resultado.count("c") <= 1000)
        self.assertTrue(resultado.count("c") > 0)

    def test_tope_total_respeta_orden(self):
        partes = [
            ("A", "a" * 10000, 8000),
            ("B", "b" * 10000, 8000),
        ]
        resultado = C.armar_contexto(partes, 12000)
        # A toma su tope (8000), B toma lo que queda (4000)
        self.assertLessEqual(len(resultado), 12000)
        self.assertTrue(resultado.count("a") <= 8000)
        self.assertTrue(resultado.count("b") <= 4000)

    def test_partes_vacias_no_rompen(self):
        partes = [
            ("A", "", 1000),
            ("B", "contenido", 1000),
        ]
        resultado = C.armar_contexto(partes, 5000)
        self.assertIn("=== B ===", resultado)
        self.assertNotIn("=== A ===", resultado)  # parte vacía no se incluye

    def test_tope_cero_devuelve_vacio(self):
        partes = [("A", "texto", 1000)]
        resultado = C.armar_contexto(partes, 0)
        self.assertEqual("", resultado)

    def test_lista_vacia_devuelve_vacio(self):
        resultado = C.armar_contexto([], 1000)
        self.assertEqual("", resultado)


class TestContextoCartero(unittest.TestCase):
    """Pruebas de _contexto() leyendo archivos reales en carpeta temporal."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        # Parchear RAIZ del módulo
        self.raiz_original = C.RAIZ
        C.RAIZ = self.raiz

    def tearDown(self):
        C.RAIZ = self.raiz_original
        self.tmp.cleanup()

    def _escribir(self, ruta_rel, contenido):
        ruta = self.raiz / ruta_rel
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(contenido, encoding="utf-8")

    def test_todos_los_archivos_existen(self):
        self._escribir("starseed_memory_root/relevo/relevo.md", "RELEVO " + "R" * 5000)
        self._escribir("starseed_memory_root/pruebas/plan-activo.md", "PLAN " + "P" * 3000)
        self._escribir("starseed_memory_root/pruebas/registro-pruebas.md", "REGISTRO " + "X" * 4000)
        self._escribir("starseed_memory_root/pruebas/registro.jsonl", "\n".join([f'{{"n":{i}}}' for i in range(30)]))
        self._escribir("PUENTE-DE-MANDO.md", "PUENTE " + "U" * 5000)
        self._escribir("memory/orquestacion-economica.md", "ORQUESTACION " + "O" * 5000)

        ctx = C._contexto()
        # Verificar que todos los títulos aparecen en orden de prioridad
        self.assertIn("=== RELEVO ===", ctx)
        self.assertIn("=== PLAN ACTIVO ===", ctx)
        self.assertIn("=== REGISTRO PRUEBAS ===", ctx)
        self.assertIn("=== ÚLTIMAS 20 LÍNEAS REGISTRO ===", ctx)
        self.assertIn("=== PUENTE DE MANDO ===", ctx)
        self.assertIn("=== ORQUESTACIÓN ECONÓMICA ===", ctx)
        self.assertLessEqual(len(ctx), C.TOPE_CONTEXTO_PRESIDENTE)

    def test_archivos_ausentes_se_saltan_sin_error(self):
        # Solo algunos archivos
        self._escribir("PUENTE-DE-MANDO.md", "PUENTE")
        self._escribir("memory/orquestacion-economica.md", "ORQUESTACION")

        ctx = C._contexto()
        self.assertIn("=== PUENTE DE MANDO ===", ctx)
        self.assertIn("=== ORQUESTACIÓN ECONÓMICA ===", ctx)
        self.assertNotIn("=== RELEVO ===", ctx)
        self.assertNotIn("=== PLAN ACTIVO ===", ctx)

    def test_registro_jsonl_toma_ultimas_20_lineas(self):
        lineas = [f'{{"n":{i}}}' for i in range(50)]
        self._escribir("starseed_memory_root/pruebas/registro.jsonl", "\n".join(lineas))

        ctx = C._contexto()
        self.assertIn("=== ÚLTIMAS 20 LÍNEAS REGISTRO ===", ctx)
        # Deben estar las últimas 20 (30-49)
        self.assertIn('{"n":49}', ctx)
        self.assertIn('{"n":30}', ctx)
        self.assertNotIn('{"n":29}', ctx)

    def test_registro_pruebas_md_largo_se_recorta_al_final(self):
        # Texto largo que supera su tope de parte
        contenido = "INICIO " + "X" * 10000 + " FINAL"
        self._escribir("starseed_memory_root/pruebas/registro-pruebas.md", contenido)

        ctx = C._contexto()
        self.assertIn("=== REGISTRO PRUEBAS ===", ctx)
        # Debe contener el final (porque se recorta por el final si es largo)
        self.assertIn("FINAL", ctx)

    def test_tope_total_16000(self):
        # Llenar todo al máximo
        for nombre in [
            "starseed_memory_root/relevo/relevo.md",
            "starseed_memory_root/pruebas/plan-activo.md",
            "starseed_memory_root/pruebas/registro-pruebas.md",
            "PUENTE-DE-MANDO.md",
            "memory/orquestacion-economica.md",
        ]:
            self._escribir(nombre, "X" * 10000)
        self._escribir("starseed_memory_root/pruebas/registro.jsonl", "\n".join([f'{{"n":{i}}}' for i in range(100)]))

        ctx = C._contexto()
        self.assertLessEqual(len(ctx), C.TOPE_CONTEXTO_PRESIDENTE)


class TestPromptPresidenteUsaNuevoTope(unittest.TestCase):
    """Verifica que prompt_presidente y prompt_sesion_fresca usan TOPE_CONTEXTO_PRESIDENTE."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.raiz = Path(self.tmp.name)
        self.raiz_original = C.RAIZ
        C.RAIZ = self.raiz

    def tearDown(self):
        C.RAIZ = self.raiz_original
        self.tmp.cleanup()

    def test_prompt_presidente_usa_tope_16000(self):
        import director_presidente as P
        # Crear contexto muy largo
        largo = "X" * 20000
        hilo = []
        prompt = P.prompt_presidente("pregunta", hilo, largo)
        # El contexto debe recortarse a TOPE_CONTEXTO_PRESIDENTE (16000) no a 8000
        self.assertIn("Contexto del proyecto:", prompt)
        # Verificar que el recorte es ~16000 no ~8000
        # El contexto está entre "Contexto del proyecto:\n" y el siguiente "\n\n"
        idx = prompt.index("Contexto del proyecto:\n")
        inicio_ctx = idx + len("Contexto del proyecto:\n")
        fin_ctx = prompt.find("\n\n", inicio_ctx)
        if fin_ctx == -1:
            fin_ctx = len(prompt)
        ctx_en_prompt = prompt[inicio_ctx:fin_ctx]
        self.assertLessEqual(len(ctx_en_prompt), C.TOPE_CONTEXTO_PRESIDENTE)
        # Debe ser ~16000, no ~8000
        self.assertGreater(len(ctx_en_prompt), 10000)

    def test_prompt_sesion_fresca_usa_tope_16000(self):
        import director_presidente as P
        largo = "X" * 20000
        hilo = []
        prompt = P.prompt_sesion_fresca("pregunta", hilo, largo, tope=P.TOPE_PROMPT_FRESCO)
        # El contexto dentro del prompt debe estar recortado a TOPE_CONTEXTO_PRESIDENTE
        self.assertIn("Contexto del proyecto:", prompt)
        idx = prompt.index("Contexto del proyecto:\n")
        # Buscar hasta el siguiente encabezado o fin
        resto = prompt[idx:]
        self.assertIn("Contexto del proyecto:", resto)


if __name__ == "__main__":
    unittest.main()