#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas del reintento de git push en nube-gh.py."""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

import importlib.util
spec = importlib.util.spec_from_file_location("nube_gh", os.path.join(os.path.dirname(__file__), "nube-gh.py"))
NG = importlib.util.module_from_spec(spec)
spec.loader.exec_module(NG)

# Mock del módulo cola_en_rama
import cola_en_rama as CER
sys.modules['cola_en_rama'] = CER


class PushConReintento(unittest.TestCase):
    """El git push a la rama de la cola reintenta con espera exponencial."""

    def test_push_reintenta_hasta_tres_veces(self):
        """Si el push falla, reintenta hasta 3 veces con espera entre intentos."""
        llamadas = []

        def sh_rc_mock(orden, timeout=120):
            if orden[:3] == ["git", "push", "-q"]:
                llamadas.append(orden)
                if len(llamadas) < 3:
                    return 1, "error temporal de red"
                return 0, ""
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_mock):
            with mock.patch.object(NG, "_esperar_run", lambda *a, **k: "123"):
                with mock.patch.object(NG, "soltar_cedidas", lambda *a, **k: []):
                    with mock.patch.object(NG, "_anotar_lanzamiento", lambda *a, **k: None):
                        with mock.patch.object(NG, "_podar_ramas_de_cola", lambda *a, **k: None):
                            with mock.patch.object(NG, "_run_vivo_con_cola", lambda *a, **k: None):
                                with mock.patch.object(NG, "trabajadores_para", lambda *a, **k: "3"):
                                    with mock.patch.object(NG, "_tareas_de_cola", lambda *a, **k: 5):
                                        with mock.patch.object(CER, "commit_suelto_con_cola", lambda *a, **k: "abc123"):
                                            # No debe lanzar excepción
                                            NG._lanzar(["--tope", "6", "--trabajadores", "3", "--cola", "enjambre/colas/cola-test.json"])

        self.assertEqual(len(llamadas), 3)

    def test_push_falla_despues_de_tres_reintentos(self):
        """Si el push falla 3 veces, marca la cola como no lanzada y sale con error."""
        llamadas = []

        def sh_rc_mock(orden, timeout=120):
            if orden[:3] == ["git", "push", "-q"]:
                llamadas.append(orden)
                return 1, "error persistente"
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_mock):
            with mock.patch.object(NG, "_run_vivo_con_cola", lambda *a, **k: None):
                with mock.patch.object(NG, "trabajadores_para", lambda *a, **k: "3"):
                    with mock.patch.object(NG, "_tareas_de_cola", lambda *a, **k: 5):
                        with mock.patch.object(NG, "preparar_estado_para_nube", lambda *a, **k: []):
                            with mock.patch.object(CER, "commit_suelto_con_cola", lambda *a, **k: "abc123"):
                                with self.assertRaises(SystemExit) as ctx:
                                    NG._lanzar(["--tope", "6", "--trabajadores", "3", "--cola", "enjambre/colas/cola-test.json"])

        self.assertEqual(len(llamadas), 3)
        self.assertIn("no pude empujar", str(ctx.exception))

    def test_push_exitoso_en_primer_intento(self):
        """Si el push sale a la primera, no hay reintentos."""
        llamadas = []

        def sh_rc_mock(orden, timeout=120):
            if orden[:3] == ["git", "push", "-q"]:
                llamadas.append(orden)
                return 0, ""
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_mock):
            with mock.patch.object(NG, "_esperar_run", lambda *a, **k: "123"):
                with mock.patch.object(NG, "soltar_cedidas", lambda *a, **k: []):
                    with mock.patch.object(NG, "_anotar_lanzamiento", lambda *a, **k: None):
                        with mock.patch.object(NG, "_podar_ramas_de_cola", lambda *a, **k: None):
                            with mock.patch.object(NG, "_run_vivo_con_cola", lambda *a, **k: None):
                                with mock.patch.object(NG, "trabajadores_para", lambda *a, **k: "3"):
                                    with mock.patch.object(NG, "_tareas_de_cola", lambda *a, **k: 5):
                                        with mock.patch.object(NG, "preparar_estado_para_nube", lambda *a, **k: []):
                                            with mock.patch.object(CER, "commit_suelto_con_cola", lambda *a, **k: "abc123"):
                                                NG._lanzar(["--tope", "6", "--trabajadores", "3", "--cola", "enjambre/colas/cola-test.json"])

        self.assertEqual(len(llamadas), 1)


if __name__ == "__main__":
    unittest.main()