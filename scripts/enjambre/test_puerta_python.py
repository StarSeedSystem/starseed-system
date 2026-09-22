"""Pruebas para la puerta condicional de Python (p321Jc)."""

import os
import sys
import unittest
from unittest import mock

# Asegurar import de starseed-enjambre.py
ENJAMBRE_DIR = os.path.dirname(os.path.abspath(__file__))
if ENJAMBRE_DIR not in sys.path:
    sys.path.insert(0, ENJAMBRE_DIR)

import importlib

enjambre = importlib.import_module("starseed-enjambre")


class TestPuertaPython(unittest.TestCase):
    """Pruebas unitarias de la puerta condicional de Python."""

    def test_tarea_sin_py_no_dispara_puerta(self):
        """Una tarea que cambió src/algo.tsx no dispara la puerta."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["src/algo.tsx"]
        ):
            with mock.patch.object(enjambre, "sh") as mock_sh:
                rc, out = enjambre._puerta_python("/falso/wt", tid="t1")
                self.assertEqual(rc, 0)
                self.assertEqual(out, "")
                mock_sh.assert_not_called()

    def test_tarea_con_py_en_puente_dispara_puerta(self):
        """Una tarea que cambió scripts/puente/x.py sí dispara la puerta."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(
                enjambre, "sh", return_value=(0, "Ran 5 tests OK")
            ) as mock_sh:
                rc, out = enjambre._puerta_python("/falso/wt", tid="t2")
                self.assertEqual(rc, 0)
                self.assertIn("Ran 5 tests OK", out)
                self.assertEqual(mock_sh.call_count, 1)
                cmd = mock_sh.call_args[0][0]
                self.assertIn("scripts/puente", cmd)

    def test_tarea_con_py_en_enjambre_dispara_ambos_dirs(self):
        """Una tarea que cambió scripts/enjambre/x.py dispara puente y enjambre."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/enjambre/x.py"]
        ):
            with mock.patch.object(enjambre, "sh", return_value=(0, "OK")) as mock_sh:
                rc, out = enjambre._puerta_python("/falso/wt", tid="t3")
                self.assertEqual(rc, 0)
                self.assertEqual(mock_sh.call_count, 2)
                cmds = [call[0][0] for call in mock_sh.call_args_list]
                self.assertTrue(any("scripts/puente" in c for c in cmds))
                self.assertTrue(any("scripts/enjambre" in c for c in cmds))

    def test_suite_en_rojo_marca_fallo_con_linea_de_error(self):
        """Una suite en rojo deja la tarea en fallo_tests con la primera línea del error."""
        salida_error = "Traceback (most recent call last):\nFAIL: test_foo (test_bar.TestBar)\nAssertionError: 1 != 2"
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(enjambre, "sh", return_value=(1, salida_error)):
                rc, out = enjambre._puerta_python("/falso/wt", tid="t4")
                self.assertNotEqual(rc, 0)
                linea = enjambre._primera_linea_error(out)
                self.assertEqual(linea, "FAIL: test_foo (test_bar.TestBar)")

    def test_suite_en_verde_deja_seguir(self):
        """Una suite en verde deja seguir."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(
                enjambre, "sh", return_value=(0, "Ran 10 tests in 0.1s\nOK")
            ):
                rc, out = enjambre._puerta_python("/falso/wt", tid="t5")
                self.assertEqual(rc, 0)

    def test_lanzamiento_reventado_avisa_y_no_bloquea(self):
        """Si el lanzamiento revienta (p.ej. excentricidad/error), avisa y no bloquea."""
        with mock.patch.object(
            enjambre, "_tocados_por_la_tarea", return_value=["scripts/puente/x.py"]
        ):
            with mock.patch.object(
                enjambre, "sh", side_effect=OSError("python3 no encontrado")
            ):
                with mock.patch.object(enjambre, "evento") as mock_evento:
                    rc, out = enjambre._puerta_python("/falso/wt", tid="t6")
                    self.assertEqual(rc, 0)
                    self.assertIn("puerta python no se pudo lanzar", out)
                    mock_evento.assert_called_once()
                    self.assertEqual(mock_evento.call_args[0][0], "aviso")


if __name__ == "__main__":
    unittest.main()


class TestCadaDirectorioConSuCorredor(unittest.TestCase):
    """(2026-09-22, MEDIDO) Aquí se tiraba el trabajo de la nube entera.

    La puerta del agente corría `unittest discover` sobre `scripts/enjambre`, donde viven
    pruebas escritas para PYTEST (`test_revisores.py` usa `@pytest.fixture(autouse=True)`).
    unittest no ejecuta esas fixtures, así que saltaban siete errores del tipo:

        AttributeError: 'CandidatosTest' object has no attribute 'salud'

    Con pytest, ese mismo archivo: 10 passed. Las cinco tareas de la cola de la nube de las
    10:03 —TK1c, c313_QW4, c313_QW6, RM3, RM4— murieron con el MISMO `fallo_tests`, por una
    prueba que en la Mac estaba verde y que no tenía nada que ver con ellas.
    """

    def test_el_enjambre_se_prueba_con_pytest(self):
        orden = enjambre.orden_de_pruebas("scripts/enjambre", "python3")
        self.assertIn("pytest", orden)
        self.assertNotIn("unittest", orden)

    def test_da_igual_la_barra_final(self):
        self.assertIn("pytest", enjambre.orden_de_pruebas("scripts/enjambre/", "python3"))

    def test_el_puente_sigue_con_unittest(self):
        orden = enjambre.orden_de_pruebas("scripts/puente", "python3")
        self.assertIn("unittest", orden)
        self.assertNotIn("pytest", orden)

    def test_usa_el_python_que_se_le_pasa(self):
        self.assertEqual(enjambre.orden_de_pruebas("scripts/puente", "/usr/bin/python3")[0], "/usr/bin/python3")
