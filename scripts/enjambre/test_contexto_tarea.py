# -*- coding: utf-8 -*-
"""Tests de la regla de tests en `contexto_tarea` (2026-09-08, Ola 288 · O1).

Por qué: las cinco tareas cuyo trabajo se perdió (V8, V5, K1, A7, F2) fallaban por lo mismo —
el agente escribía un test que hacía `vi.mock` de un módulo de Node o que importaba un
`route.ts` del App Router. Ahora `REGLA_TESTS` viaja SIEMPRE en el prompt (solo cuando la tarea
puede tener tests de TypeScript, decidido por `toca_tests_ts`). Sin red ni disco: el módulo se
importa con importlib (el nombre lleva guiones, como en test_revisores.py) y la escritura de
contexto `_guardar_contexto` se parchea con monkeypatch para no dejar archivos.
"""
import importlib.util
import os
import sys
import unittest

import pytest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)


class TocaTestsTsTest(unittest.TestCase):
    """`toca_tests_ts` decide si una tarea puede llevar tests de TypeScript (función pura)."""

    def test_archivo_ts_es_true(self):
        self.assertTrue(enjambre.toca_tests_ts(["src/lib/a.ts"]))

    def test_solo_python_es_false(self):
        self.assertFalse(enjambre.toca_tests_ts(["scripts/enjambre/x.py"]))

    def test_lista_vacia_es_false(self):
        self.assertFalse(enjambre.toca_tests_ts([]))

    def test_markdown_json_sh_sh_solo_es_false(self):
        self.assertFalse(enjambre.toca_tests_ts(["README.md", "cola.json", "go.sh"]))

    def test_tsx_cuenta_como_ts(self):
        # Los componentes del OS viven en .tsx: también llevan la regla.
        self.assertTrue(enjambre.toca_tests_ts(["src/lib/a.tsx"]))


class ContextoTareaTest(unittest.TestCase):
    """La regla solo aparece cuando hay tests TS, y nunca para tareas de Python."""

    @pytest.fixture(autouse=True)
    def _sin_disco(self, monkeypatch):
        # `contexto_tarea` llama a `_guardar_contexto`, que escribe en olas/contextos/.
        monkeypatch.setattr(enjambre, "_guardar_contexto", lambda t, c: None)

    def test_con_ts_incluye_funciones_puras_y_vi_mock(self):
        contexto = enjambre.contexto_tarea(
            {"id": "X", "prompt": "p", "archivos": ["src/lib/a.ts"], "titulo": "t"})
        self.assertIn("funciones puras", contexto)
        self.assertIn("vi.mock", contexto)

    def test_con_python_no_incluye_vi_mock(self):
        contexto = enjambre.contexto_tarea(
            {"id": "X", "prompt": "p", "archivos": ["a.py"], "titulo": "t"})
        self.assertNotIn("vi.mock", contexto)


if __name__ == "__main__":
    unittest.main()