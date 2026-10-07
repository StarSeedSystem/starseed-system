# -*- coding: utf-8 -*-
"""Pruebas de motores_director.py (solo lo puro, sin lanzar procesos)."""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import motores_director as M


class TestEntornoSinClaves(unittest.TestCase):
    def test_quita_las_dos_claves_y_respeta_el_resto(self):
        env = {
            "ANTHROPIC_API_KEY": "valor",
            "ANTHROPIC_AUTH_TOKEN": "valor",
            "PATH": "/usr/bin",
            "HOME": "/tmp",
        }
        limpio = M.entorno_sin_claves_api(env)
        self.assertNotIn("ANTHROPIC_API_KEY", limpio)
        self.assertNotIn("ANTHROPIC_AUTH_TOKEN", limpio)
        self.assertEqual("/usr/bin", limpio["PATH"])
        self.assertEqual("/tmp", limpio["HOME"])

    def test_no_toca_el_original(self):
        env = {"ANTHROPIC_API_KEY": "valor", "PATH": "/usr/bin"}
        M.entorno_sin_claves_api(env)
        self.assertIn("ANTHROPIC_API_KEY", env)

    def test_sin_claves_no_falla(self):
        self.assertEqual({"PATH": "/x"}, M.entorno_sin_claves_api({"PATH": "/x"}))


class TestOrdenClaude(unittest.TestCase):
    def test_orden_basica(self):
        orden = M.orden_claude("hola")
        self.assertEqual("claude", orden[0])
        self.assertIn("-p", orden)
        self.assertIn("hola", orden)
        self.assertIn("--model", orden)
        self.assertIn("claude-opus-5-5", orden)
        self.assertIn("--output-format", orden)
        self.assertIn("json", orden)
        self.assertIn("--max-turns", orden)
        self.assertIn("6", orden)
        self.assertIn("--allowedTools", orden)
        self.assertIn("Read,Glob,Grep", orden)
        self.assertNotIn("--resume", orden)

    def test_con_sesion_reanuda(self):
        orden = M.orden_claude("sigue", sesion="ses-1")
        self.assertIn("--resume", orden)
        self.assertIn("ses-1", orden)

    def test_las_herramientas_prohibidas_van_en_disallowed(self):
        orden = M.orden_claude("x")
        i = orden.index("--disallowedTools")
        prohibidas = orden[i + 1]
        for nombre in (
            "Bash",
            "Edit",
            "Write",
            "NotebookEdit",
            "WebFetch",
            "WebSearch",
            "Task",
        ):
            self.assertIn(nombre, prohibidas)


class TestLeerClaude(unittest.TestCase):
    def _json(self, **campos):
        base = {
            "result": "hecho",
            "is_error": False,
            "session_id": "ses-1",
            "usage": {"input_tokens": 10, "output_tokens": 20},
            "total_cost_usd": 0.03,
        }
        base.update(campos)
        return json.dumps(base)

    def test_exito(self):
        r = M.leer_claude(self._json())
        self.assertEqual("hecho", r["texto"])
        self.assertEqual("ses-1", r["sesion"])
        self.assertEqual(10, r["tokens_entrada"])
        self.assertEqual(20, r["tokens_salida"])
        self.assertAlmostEqual(0.03, r["coste"])
        self.assertIsNone(r["error"])

    def test_is_error(self):
        r = M.leer_claude(self._json(is_error=True, result="falló"))
        self.assertEqual("falló", r["error"])

    def test_basura(self):
        r = M.leer_claude("no es json {")
        self.assertIsNotNone(r["error"])
        self.assertEqual("", r["texto"])
        self.assertIsNone(r["sesion"])


class TestOrdenHermes(unittest.TestCase):
    def test_basica(self):
        self.assertEqual(["hermes", "-z", "hola"], M.orden_hermes("hola"))

    def test_modelo_predeterminado_no_agrega_nada(self):
        self.assertEqual(
            ["hermes", "-z", "hola"], M.orden_hermes("hola", modelo="predeterminado")
        )

    def test_modelo_y_archivo_uso(self):
        orden = M.orden_hermes("hola", modelo="m-1", archivo_uso="/tmp/u.json")
        self.assertIn("-m", orden)
        self.assertIn("m-1", orden)
        self.assertIn("--usage-file", orden)
        self.assertIn("/tmp/u.json", orden)


class TestOrdenCodex(unittest.TestCase):
    def test_orden(self):
        orden = M.orden_codex("gpt-x", "/tmp/raiz")
        self.assertEqual(
            [
                "codex",
                "exec",
                "-m",
                "gpt-x",
                "-s",
                "read-only",
                "--skip-git-repo-check",
                "-C",
                "/tmp/raiz",
                "-",
            ],
            orden,
        )


class TestPromptDirector(unittest.TestCase):
    def test_estructura(self):
        historial = [
            {"rol": "alex", "texto": "¿qué hay?"},
            {"rol": "director", "texto": "tres tareas"},
        ]
        p = M.prompt_director("¿y ahora?", historial, "contexto breve")
        self.assertIn("dirección de Genesis", p)
        self.assertIn("no escribes código", p)
        self.assertIn("Contexto:", p)
        self.assertIn("contexto breve", p)
        self.assertIn("Alex: ¿qué hay?", p)
        self.assertIn("Dirección: tres tareas", p)
        self.assertIn("Pregunta de Alex: ¿y ahora?", p)

    def test_recorta_contexto_y_historial(self):
        historial = [{"rol": "alex", "texto": f"t{i}"} for i in range(20)]
        p = M.prompt_director("p", historial, "x" * 20000)
        self.assertLessEqual(len(p), 20000 + 5000)
        self.assertIn("Alex: t8", p)
        self.assertNotIn("Alex: t7\n", p)


if __name__ == "__main__":
    unittest.main()
