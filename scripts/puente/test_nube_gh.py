#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas para el empuje a GitHub con reintentos (nube-gh.py)."""
import os
import sys
import tempfile
import unittest
from unittest import mock

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
if DIRECTORIO not in sys.path:
    sys.path.insert(0, DIRECTORIO)

import importlib.util

RUTA_NUBE_GH = os.path.join(DIRECTORIO, "nube-gh.py")
spec = importlib.util.spec_from_file_location("nube_gh", RUTA_NUBE_GH)
if spec is None or spec.loader is None:
    raise ImportError("No se pudo cargar nube-gh.py")
NG = importlib.util.module_from_spec(spec)
spec.loader.exec_module(NG)  # noqa: E402


class PushConReintentos(unittest.TestCase):
    """El empuje de la rama de la cola a GitHub reintenta con espera y no deja el job sin salir."""

    def setUp(self):
        # Crear una cola temporal para las pruebas
        self.tmpdir = tempfile.mkdtemp()
        self.cola_path = os.path.join(self.tmpdir, "cola-test.json")
        with open(self.cola_path, "w") as f:
            import json
            json.dump({"tareas": [{"id": "TEST1", "archivos": ["a.ts"]}]}, f)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_push_reintenta_en_fallo_transitorio(self):
        """Si git push falla por error transitorio (red), reintenta con backoff."""
        llamadas = []

        def sh_rc_falla_dos_veces(orden, timeout=120):
            llamadas.append(orden)
            if orden[:3] == ["git", "push", "-q"]:
                if len([c for c in llamadas if c[:3] == ["git", "push", "-q"]]) <= 2:
                    return 1, "network error: connection reset"
                return 0, ""
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_falla_dos_veces), \
             mock.patch.object(NG, "_no_lanzada"), \
             mock.patch.object(NG, "motivo_push", lambda t: t), \
             mock.patch.object(NG, "_esperar_run", lambda r: "123"), \
             mock.patch.object(NG, "soltar_cedidas", lambda *a: []), \
             mock.patch.object(NG, "_anotar_lanzamiento"), \
             mock.patch.object(NG, "_podar_ramas_de_cola"), \
             mock.patch.object(NG, "preparar_estado_para_nube", lambda *a: []), \
             mock.patch.object(NG, "cola_creada", lambda *a: None), \
             mock.patch("cola_en_rama.commit_suelto_con_cola", lambda *a, **k: "ref-head"):
            # No debe lanzar excepción, debe reintentar y al final tener éxito
            try:
                NG._lanzar(["--cola", self.cola_path, "--tope", "1", "--trabajadores", "1", "--minutos", "60"])
            except SystemExit as e:
                self.fail("No debería salir con SystemExit en fallo transitorio: %s" % e)

        # Debe haber llamado a git push 3 veces (1 inicial + 2 reintentos)
        pushes = [c for c in llamadas if c[:3] == ["git", "push", "-q"]]
        self.assertEqual(len(pushes), 3)

    def test_push_fallo_permanente_despues_de_reintentos(self):
        """Si git push falla persistentemente, abandona tras los reintentos y marca la cola."""
        llamadas = []

        def sh_rc_siempre_falla(orden, timeout=120):
            llamadas.append(orden)
            if orden[:3] == ["git", "push", "-q"]:
                return 1, "permission denied (publickey)"
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_siempre_falla), \
             mock.patch.object(NG, "_no_lanzada") as mock_no_lanzada, \
             mock.patch.object(NG, "motivo_push", lambda t: t), \
             mock.patch.object(NG, "_esperar_run", lambda r: "123"), \
             mock.patch.object(NG, "soltar_cedidas", lambda *a: []), \
             mock.patch.object(NG, "_anotar_lanzamiento"), \
             mock.patch.object(NG, "_podar_ramas_de_cola"), \
             mock.patch.object(NG, "preparar_estado_para_nube", lambda *a: []), \
             mock.patch.object(NG, "cola_creada", lambda *a: None), \
             mock.patch("cola_en_rama.commit_suelto_con_cola", lambda *a, **k: "ref-head"):
            with self.assertRaises(SystemExit) as ctx:
                NG._lanzar(["--cola", self.cola_path, "--tope", "1", "--trabajadores", "1", "--minutos", "60"])
            self.assertIn("no pude empujar", str(ctx.exception))
            mock_no_lanzada.assert_called()

        # Debe haber llamado a git push 4 veces (1 inicial + 3 reintentos = 4 intentos totales)
        pushes = [c for c in llamadas if c[:3] == ["git", "push", "-q"]]
        self.assertEqual(len(pushes), 4)

    def test_gh_workflow_run_reintenta(self):
        """Si gh workflow run falla, reintenta antes de abandonar."""
        push_llamadas = 0
        workflow_llamadas = 0

        def sh_rc(orden, timeout=120):
            nonlocal push_llamadas, workflow_llamadas
            if orden[:3] == ["git", "push", "-q"]:
                push_llamadas += 1
                return 0, ""
            if orden[:2] == ["gh", "workflow"]:
                workflow_llamadas += 1
                if workflow_llamadas <= 2:
                    return 1, "API rate limit exceeded"
                return 0, ""
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc), \
             mock.patch.object(NG, "_no_lanzada"), \
             mock.patch.object(NG, "motivo_push", lambda t: t), \
             mock.patch.object(NG, "_esperar_run", lambda r: "123"), \
             mock.patch.object(NG, "soltar_cedidas", lambda *a: []), \
             mock.patch.object(NG, "_anotar_lanzamiento"), \
             mock.patch.object(NG, "_podar_ramas_de_cola"), \
             mock.patch.object(NG, "preparar_estado_para_nube", lambda *a: []), \
             mock.patch.object(NG, "cola_creada", lambda *a: None), \
             mock.patch("cola_en_rama.commit_suelto_con_cola", lambda *a, **k: "ref-head"):
            try:
                NG._lanzar(["--cola", self.cola_path, "--tope", "1", "--trabajadores", "1", "--minutos", "60"])
            except SystemExit as e:
                self.fail("No debería salir con SystemExit en fallo transitorio de workflow: %s" % e)

        self.assertEqual(push_llamadas, 1)
        self.assertEqual(workflow_llamadas, 3)  # 1 inicial + 2 reintentos

    def test_no_deja_job_sin_salir(self):
        """En cualquier caso (éxito o fallo final), la función termina (no se queda colgada)."""
        def sh_rc_siempre_falla(orden, timeout=120):
            if orden[:3] == ["git", "push", "-q"]:
                return 1, "fatal: unable to access"
            return 0, ""

        with mock.patch.object(NG, "_sh_rc", sh_rc_siempre_falla), \
             mock.patch.object(NG, "_no_lanzada") as mock_no_lanzada, \
             mock.patch.object(NG, "motivo_push", lambda t: t), \
             mock.patch.object(NG, "_esperar_run", lambda r: "123"), \
             mock.patch.object(NG, "soltar_cedidas", lambda *a: []), \
             mock.patch.object(NG, "_anotar_lanzamiento"), \
             mock.patch.object(NG, "_podar_ramas_de_cola"), \
             mock.patch.object(NG, "preparar_estado_para_nube", lambda *a: []), \
             mock.patch.object(NG, "cola_creada", lambda *a: None), \
             mock.patch("cola_en_rama.commit_suelto_con_cola", lambda *a, **k: "ref-head"):
            with self.assertRaises(SystemExit):
                NG._lanzar(["--cola", self.cola_path, "--tope", "1", "--trabajadores", "1", "--minutos", "60"])
            # La función SÍ termina (lanza SystemExit), no se queda en bucle infinito
            mock_no_lanzada.assert_called()


if __name__ == "__main__":
    unittest.main()