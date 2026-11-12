#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pruebas de la decisión por jobs cuando GitHub no cierra el run (SUP1111C).
Sin red, sin git real: todo pasa por un `Medios` falso."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402
from test_autopublicar import Falso, run, SHA, T0  # noqa: E402


class FalsoConJobs(Falso):
    """Falso que guarda cada ruta de `gh` y, si contiene "/jobs", devuelve lo que diga la prueba."""
    def __init__(self, jobs_respuesta=None, **o):
        super().__init__(**o)
        self.jobs_respuesta = jobs_respuesta
        self.rutas_gh = []

    def gh(self, ruta):
        self.rutas_gh.append(ruta)
        if "/jobs" in ruta:
            if self.jobs_respuesta is None:
                return None
            if isinstance(self.jobs_respuesta, dict):
                return self.jobs_respuesta
            return {"jobs": self.jobs_respuesta}
        return super().gh(ruta)


class VeredictoPorJobs(unittest.TestCase):
    """Pruebas directas de la función pura `veredicto_por_jobs`."""

    def test_lista_vacia_devuelve_none(self):
        self.assertIsNone(A.veredicto_por_jobs([]))

    def test_none_devuelve_none(self):
        self.assertIsNone(A.veredicto_por_jobs(None))

    def test_no_lista_devuelve_none(self):
        self.assertIsNone(A.veredicto_por_jobs("x"))
        self.assertIsNone(A.veredicto_por_jobs([1]))
        self.assertIsNone(A.veredicto_por_jobs([{"status": "completed"}]))

    def test_job_sin_conclusion_devuelve_none(self):
        self.assertIsNone(A.veredicto_por_jobs([{"status": "completed", "conclusion": None}]))

    def test_success_mas_skipped_verde(self):
        self.assertEqual(A.veredicto_por_jobs([
            {"status": "completed", "conclusion": "success"},
            {"status": "completed", "conclusion": "skipped"},
        ]), "verde")

    def test_success_mas_cancelled_rojo(self):
        self.assertEqual(A.veredicto_por_jobs([
            {"status": "completed", "conclusion": "success"},
            {"status": "completed", "conclusion": "cancelled"},
        ]), "rojo")

    def test_job_in_progress_devuelve_none(self):
        self.assertIsNone(A.veredicto_por_jobs([{"status": "in_progress", "conclusion": None}]))


class SeguirCiConJobs(unittest.TestCase):
    """Pruebas de integración: `_seguir_ci` pide `/jobs` tras el tope y decide por ellos."""

    def test_run_in_progress_jobs_todos_completed_success_verificando_push_y_aviso(self):
        """(a) run in_progress y jobs todos completed/success a T0 + CI_TOPE_S + 1 → fase "verificando",
        un push a …:main y un aviso con "decido por ellos"."""
        m = FalsoConJobs(
            jobs_respuesta=[
                {"status": "completed", "conclusion": "success"},
                {"status": "completed", "conclusion": "skipped"},
            ],
            runs=[run("in_progress", None)],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "verificando")
        # Push a main sin --force
        self.assertTrue(any(p[-1].endswith(":main") and "--force" not in p for p in m.pushes))
        # Aviso con "decido por ellos"
        self.assertTrue(any("decido por ellos" in a for a in m.avisos))
        # Se pidió /jobs
        self.assertTrue(any("/jobs" in r for r in m.rutas_gh))

    def test_jobs_completed_con_un_failure_bloqueado_motivo_ci_en_rojo_sin_push(self):
        """(b) jobs completed con un "failure" → fase "bloqueado", historial[-1]["motivo"] == "CI en rojo"
        y ningún push a main."""
        m = FalsoConJobs(
            jobs_respuesta=[
                {"status": "completed", "conclusion": "success"},
                {"status": "completed", "conclusion": "failure"},
            ],
            runs=[run("in_progress", None)],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["historial"][-1]["motivo"], "CI en rojo")
        self.assertEqual([p for p in m.pushes if p[-1].endswith(":main")], [])

    def test_un_job_todavia_in_progress_bloqueado_motivo_ci_sin_terminar(self):
        """(c) un job todavía in_progress → "bloqueado" con motivo "CI sin terminar en 50 min"."""
        m = FalsoConJobs(
            jobs_respuesta=[
                {"status": "completed", "conclusion": "success"},
                {"status": "in_progress", "conclusion": None},
            ],
            runs=[run("in_progress", None)],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["detalle"], "CI sin terminar en 50 min")

    def test_gh_de_jobs_devuelve_none_mismo_veto_que_anterior(self):
        """(d) gh de /jobs devuelve None → el mismo veto de (c)."""
        m = FalsoConJobs(
            jobs_respuesta=None,
            runs=[run("in_progress", None)],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["detalle"], "CI sin terminar en 50 min")

    def test_antes_del_tope_no_se_pide_jobs(self):
        """(e) a T0 + 600 con el run in_progress → fase "ci" y ninguna ruta con "/jobs"."""
        m = FalsoConJobs(
            jobs_respuesta=[{"status": "completed", "conclusion": "success"}],
            runs=[run("in_progress", None)],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + 600)
        self.assertEqual(e["fase"], "ci")
        self.assertFalse(any("/jobs" in r for r in m.rutas_gh))

    def test_sin_run_no_cambia(self):
        """(f) sin-run no cambia: sigue el comportamiento actual."""
        m = FalsoConJobs(
            runs=[],
            ancestro=True,
        )
        base = {"fase": "ci", "sha": SHA, "desde": T0}
        e = A.pasada(m, base, T0 + A.CI_TOPE_S + 1)
        self.assertEqual(e["fase"], "bloqueado")
        self.assertEqual(e["detalle"], "CI sin terminar en 50 min")


if __name__ == "__main__":
    unittest.main()