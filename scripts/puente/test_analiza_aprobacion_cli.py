# -*- coding: utf-8 -*-
"""Pruebas para analiza-aprobacion.py (p320Fb).

Valida el comportamiento del CLI analista de aprobación de tareas,
asegurando el uso exclusivo de modelos gratuitos, el paso del diff
y el manejo de errores.
"""

import importlib.util
import io
import os
import sys
import unittest
from contextlib import redirect_stdout
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

    @patch("analiza_aprobacion.elegir_modelo_gratis")
    @patch("analiza_aprobacion.obtener_diff")
    @patch("analiza_aprobacion.leer_tarea")
    def test_sin_modelos_gratis(self, mock_tarea, mock_diff, mock_modelo):
        """Verifica la salida exacta especificada cuando no hay modelo gratis disponible."""
        mock_tarea.return_value = ({"id": "t1", "sha": "123", "rama": "main"}, "prompt")
        mock_diff.return_value = ("diff contenido", None)
        mock_modelo.return_value = None

        salida = io.StringIO()
        with (
            patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]),
            redirect_stdout(salida),
            self.assertRaises(SystemExit) as salida_cli,
        ):
            analiza_aprobacion.main()

        self.assertEqual(salida_cli.exception.code, 0)
        self.assertEqual(
            salida.getvalue(),
            '{"veredicto":"dudoso","confianza":"baja",'
            '"razones":["sin modelo gratuito disponible"],'
            '"riesgos":[],"que_revisar":[]}\n',
        )

    def test_ningun_modelo_elegido_es_anthropic(self):
        """Verifica que en NINGÚN camino se elija un modelo que contenga 'anthropic'."""
        with (
            patch.object(
                analiza_aprobacion,
                "candidatos_del_enjambre",
                return_value=[
                    ("anthropic", "claude-3-5-sonnet"),
                    ("openrouter", "anthropic/claude-3-haiku:free"),
                    ("xkiro", "qwen/qwen3.7-plus:free"),
                ],
            ),
            patch.object(analiza_aprobacion, "leer_salud_proveedores", return_value={}),
        ):
            elegido = analiza_aprobacion.elegir_modelo_gratis()
        self.assertEqual(elegido, "xkiro/qwen/qwen3.7-plus:free")
        self.assertNotIn("anthropic", elegido.lower())

    def test_rechaza_modelos_de_pago_y_proveedores_agotados(self):
        candidatos = [
            ("openrouter", "modelo-de-pago"),
            ("xkiro", "modelo-gratis:free"),
            ("llm7", "minimax-m2.7"),
        ]
        salud = {
            "xkiro": {"sin_cupo_hasta": "2999-01-01 00:00:00"},
            "llm7": {"estado": "caido"},
        }
        with (
            patch.object(
                analiza_aprobacion, "candidatos_del_enjambre", return_value=candidatos
            ),
            patch.object(
                analiza_aprobacion, "leer_salud_proveedores", return_value=salud
            ),
        ):
            self.assertIsNone(analiza_aprobacion.elegir_modelo_gratis())

    @patch("subprocess.run")
    @patch("analiza_aprobacion.output_json")
    @patch("analiza_aprobacion.elegir_modelo_gratis")
    @patch("analiza_aprobacion.leer_tarea")
    def test_modelo_devuelve_json_bueno(
        self, mock_tarea, mock_modelo, mock_out, mock_subproc
    ):
        """Modelo con JSON bueno: opencode recibe diff y opencode output es procesado."""
        mock_tarea.return_value = (
            {"id": "t1", "sha": "abc1234", "rama": "ola/t1"},
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
                self.assertEqual(cmd[-1], "abc1234")
                return res_git_stat
            elif cmd[:2] == ["git", "show"]:
                self.assertEqual(cmd[-1], "abc1234")
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
            {"id": "t1", "sha": "abc1234", "rama": "ola/t1"},
            "prompt",
        )
        mock_modelo.return_value = "xkiro/qwen3.7-plus:free"
        mock_out.side_effect = SystemExit(0)

        res_git = MagicMock(returncode=0, stdout="diff content")
        res_opencode = MagicMock(
            returncode=0,
            stdout="Esto no es un json legible...",
            stderr='{"veredicto":"aprobar","confianza":"alta"}',
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
            {"id": "t1", "sha": "abc1234", "rama": "ola/t1"},
            "prompt",
        )
        mock_out.side_effect = SystemExit(0)

        res_git_err = MagicMock(returncode=128, stderr="fatal: bad object abc1234")
        mock_subproc.return_value = res_git_err

        with patch.object(sys, "argv", ["analiza-aprobacion.py", "t1"]):
            with self.assertRaises(SystemExit):
                analiza_aprobacion.main()

        veredicto = mock_out.call_args[0][0]
        self.assertEqual(veredicto["veredicto"], "dudoso")
        self.assertEqual(veredicto["confianza"], "baja")
        self.assertTrue(any("git show" in r for r in veredicto["razones"]))


if __name__ == "__main__":
    unittest.main()
