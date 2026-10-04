# -*- coding: utf-8 -*-
"""Un tsc que muere no es un tsc limpio (2026-10-04).

La puerta contaba las líneas «error TS»; con tsc reventando por memoria no había ninguna y la
tarea pasaba con «0 errores». Así entró CC1003F con 4 errores de tipos en su prueba.
"""
import contextlib
import importlib.util
import os
import sys
import unittest
from unittest import mock

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre", RUTA)
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre"] = enjambre
ESPEC.loader.exec_module(enjambre)

OOM = "<--- Last few GCs --->\nFATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory"


class SinTerminar(unittest.TestCase):
    def test_limpio_o_con_errores_no_es_roto(self):
        self.assertIsNone(enjambre.tsc_sin_terminar(0, "", []))
        self.assertIsNone(enjambre.tsc_sin_terminar(2, "a.ts(1,1): error TS2322: x", ["a.ts(1,1): error TS2322: x"]))

    def test_motivos(self):
        self.assertEqual(enjambre.tsc_sin_terminar(134, OOM, []), "sin memoria")
        self.assertEqual(enjambre.tsc_sin_terminar(124, "TIMEOUT 900s\n", []), "se pasó de tiempo")
        self.assertEqual(enjambre.tsc_sin_terminar(134, "Abort trap: 6", []), "abortado")
        self.assertIn("rc=1", enjambre.tsc_sin_terminar(1, "algo raro", []))


class PuertaTsc(unittest.TestCase):
    def _tsc(self, salidas):
        llamadas = []

        def falso_sh(cmd, cwd=None, timeout=None, env=None, log=None):
            llamadas.append(env)
            return salidas.pop(0)

        with mock.patch.object(enjambre, "repo_es_python", return_value=False), \
                mock.patch.object(enjambre, "sh", side_effect=falso_sh), \
                mock.patch.object(
                    enjambre,
                    "cerrojo",
                    side_effect=lambda *_args, **_kwargs: contextlib.nullcontext(),
                ), \
                mock.patch.object(enjambre.time, "sleep"):
            return enjambre.tsc("/tmp/wt", None), llamadas

    def test_si_muere_por_memoria_reintenta_con_mas_monton(self):
        (rc, errs), llamadas = self._tsc([(134, OOM), (0, "")])
        self.assertEqual((rc, errs), (0, []))
        self.assertEqual(len(llamadas), 2)
        self.assertIn("3584", llamadas[1]["NODE_OPTIONS"])

    def test_si_muere_dos_veces_la_puerta_no_da_el_visto_bueno(self):
        (rc, errs), _ = self._tsc([(134, OOM), (134, OOM)])
        self.assertEqual(len(errs), 1)
        self.assertTrue(errs[0].startswith(enjambre.TSC_SIN_TERMINAR))
        self.assertIn("sin memoria", errs[0])

    def test_errores_reales_salen_a_la_primera(self):
        (rc, errs), llamadas = self._tsc([(2, "a.ts(1,1): error TS2322: x\n")])
        self.assertEqual(errs, ["a.ts(1,1): error TS2322: x"])
        self.assertEqual(len(llamadas), 1)


if __name__ == "__main__":
    unittest.main()
