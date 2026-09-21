# -*- coding: utf-8 -*-
"""Pruebas para analiza-aprobacion.py (p320Fb).

Valida el comportamiento del CLI analista de aprobación de tareas,
asegurando el uso exclusivo de modelos gratuitos, el paso del diff
y el manejo de errores.
"""

import importlib.util
import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

AQUI = os.path.dirname(os.path.abspath(__file__))
RUTA_ANALIZA = os.path.join(AQUI, "analiza-aprobacion.py")

spec = importlib.util.spec_from_file_location("analiza_aprobacion", RUTA_ANALIZA)
analiza_aprobacion = importlib.util.module_from_spec(spec)
sys.modules["analiza_aprobacion"] = analiza_aprobacion
spec.loader.exec_module(analiza_aprobacion)


class TestAnalizaAprobacionCLI(unittest.TestCase):
    def test_importacion_correcta(self):
        """Punto 3: verifica que el módulo con guion se importa sin ModuleNotFoundError."""
        self.assertTrue(hasattr(analiza_aprobacion, "main"))
        self.assertTrue(hasattr(analiza_aprobacion, "elegir_modelo_gratis"))

    @patch("analiza_aprobacion.output_json")
    @patch("analiza_aprobacion.elegir_modelo_gratis")
    @patch("analiza_aprobacion.obtener_diff")
    @patch("analiza_aprobacion.leer_tarea")
    def test_sin_modelos_gratis(self, mock_tarea, mock_diff, mock_modelo, mock_out):
        """Verifica la salida exacta especificada cuando no hay modelo gratis disponible."""
        mock_tarea.return_value = ({"id": "t1", "sha": "123", "rama": "main"}, "prompt")
        mock_diff.return_value = ("diff contenido", None)
        mock_modelo.return_value = None

        mock_out.side_effect = SystemExit(0)

        with patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]):
            with self.assertRaises(SystemExit):
                analiza_aprobacion.main()

        mock_out.assert_called_once_with(
            {
                "veredicto": "dudoso",
                "confianza": "baja",
                "razones": ["sin modelo gratuito disponible"],
                "riesgos": [],
                "que_revisar": [],
            }
        )

    def test_ningun_modelo_elegido_es_anthropic(self):
        """Verifica que en NINGÚN camino se elija un modelo que contenga 'anthropic'."""
        with (
            patch("os.path.exists", return_value=True),
            patch("importlib.util.spec_from_file_location") as mock_spec,
        ):
            mock_module = MagicMock()
            mock_module.candidatos_revision.return_value = (
                [
                    ("anthropic", "claude-3-5-sonnet"),
                    ("openrouter", "anthropic/claude-3-haiku"),
                    ("xkiro", "qwen/qwen3.7-plus:free"),
                ],
                [],
            )
            mock_spec.return_value.loader.exec_module = lambda m: None
            with patch("importlib.util.module_from_spec", return_value=mock_module):
                elegido = analiza_aprobacion.elegir_modelo_gratis()
                self.assertNotIn("anthropic", elegido.lower())
                self.assertEqual(elegido, "xkiro/qwen/qwen3.7-plus:free")

        # Probar cuando SOLO existen modelos anthropic -> debe devolver None
        with (
            patch("os.path.exists", return_value=True),
            patch("importlib.util.spec_from_file_location") as mock_spec,
        ):
            mock_module = MagicMock()
            mock_module.candidatos_revision.return_value = (
                [("anthropic", "claude-3-5-sonnet")],
                [],
            )
            mock_spec.return_value.loader.exec_module = lambda m: None
            with patch("importlib.util.module_from_spec", return_value=mock_module):
                elegido_solo_anthropic = analiza_aprobacion.elegir_modelo_gratis()
                self.assertIsNone(elegido_solo_anthropic)

    @patch("subprocess.run")
    @patch("analiza_aprobacion.output_json")
    @patch("analiza_aprobacion.elegir_modelo_gratis")
    @patch("analiza_aprobacion.leer_tarea")
    def test_modelo_devuelve_json_bueno(
        self, mock_tarea, mock_modelo, mock_out, mock_subproc
    ):
        """Modelo con JSON bueno: opencode recibe diff y opencode output es procesado."""
        mock_tarea.return_value = (
            {"id": "t1", "sha": "abc123", "rama": "ola/t1"},
            "instrucciones",
        )
        mock_modelo.return_value = "xkiro/qwen3.7-plus:free"
        mock_out.side_effect = SystemExit(0)

        res_git_stat = MagicMock(returncode=0, stdout="1 file changed, 5 insertions(+)")
        res_git_diff = MagicMock(
            returncode=0, stdout="diff --git a/foo.ts b/foo.ts\n+console.log('test');"
        )
        res_opencode = MagicMock(
            returncode=0,
            stdout='{"veredicto": "aprobar", "confianza": "alta", "razones": ["bueno"], "riesgos": [], "que_revisar": []}',
            stderr="",
        )

        def side_effect(cmd, **kwargs):
            if cmd[:3] == ["git", "show", "--stat"]:
                return res_git_stat
            elif cmd[:2] == ["git", "show"]:
                return res_git_diff
            else:
                # Comprobar que opencode run recibe el prompt que incluye el diff
                prompt_arg = cmd[2]
                self.assertIn("diff --git a/foo.ts", prompt_arg)
                self.assertIn("--model", cmd)
                self.assertIn("xkiro/qwen3.7-plus:free", cmd)
                return res_opencode

        mock_subproc.side_effect = side_effect

        with patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]):
            with self.assertRaises(SystemExit):
                analiza_aprobacion.main()

        mock_out.assert_called_once()
        veredicto_pasado = mock_out.call_args[0][0]
        self.assertEqual(veredicto_pasado["veredicto"], "aprobar")
        self.assertEqual(veredicto_pasado["confianza"], "alta")

    @patch("subprocess.run")
    @patch("analiza_aprobacion.output_json")
    @patch("analiza_aprobacion.elegir_modelo_gratis")
    @patch("analiza_aprobacion.leer_tarea")
    def test_modelo_devuelve_basura(
        self, mock_tarea, mock_modelo, mock_out, mock_subproc
    ):
        """Modelo que devuelve basura -> veredicto dudoso con confianza baja."""
        mock_tarea.return_value = (
            {"id": "t1", "sha": "abc123", "rama": "ola/t1"},
            "prompt",
        )
        mock_modelo.return_value = "xkiro/qwen3.7-plus:free"
        mock_out.side_effect = SystemExit(0)

        res_git = MagicMock(returncode=0, stdout="diff content")
        res_opencode = MagicMock(
            returncode=0, stdout="Esto no es un json legible...", stderr=""
        )

        def side_effect(cmd, **kwargs):
            if cmd[0] == "git":
                return res_git
            return res_opencode

        mock_subproc.side_effect = side_effect

        with patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]):
            with self.assertRaises(SystemExit):
                analiza_aprobacion.main()

        veredicto = mock_out.call_args[0][0]
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")

    @patch("subprocess.run")
    @patch("analiza_aprobacion.output_json")
    @patch("analiza_aprobacion.leer_tarea")
    def test_git_show_fallo(self, mock_tarea, mock_out, mock_subproc):
        """git show que falla -> dudoso con razon de fallo git."""
        mock_tarea.return_value = (
            {"id": "t1", "sha": "invalid_sha", "rama": "ola/t1"},
            "prompt",
        )
        mock_out.side_effect = SystemExit(0)

        res_git_err = MagicMock(returncode=128, stderr="fatal: bad object invalid_sha")
        mock_subproc.return_value = res_git_err

        with patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]):
            with self.assertRaises(SystemExit):
                analiza_aprobacion.main()

        veredicto = mock_out.call_args[0][0]
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")
        self.assertTrue(
            any("invalid_sha" in r or "git show" in r for r in veredicto["razones"])
        )


if __name__ == "__main__":
    unittest.main()
