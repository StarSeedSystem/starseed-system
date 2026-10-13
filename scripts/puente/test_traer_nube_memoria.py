#!/usr/bin/env python3
"""(2026-10-13) traer_nube: sin NameError con TS y sin tsc de 3 GB con la Mac sin memoria."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import traer_nube as T  # noqa: E402


class TscConPresion(unittest.TestCase):
    def test_tsc_cabe_solo_sin_aviso(self):
        self.assertTrue(T.tsc_cabe_aqui(1))
        self.assertTrue(T.tsc_cabe_aqui(0))  # sin dato (fuera de macOS): como antes
        self.assertFalse(T.tsc_cabe_aqui(2))
        self.assertFalse(T.tsc_cabe_aqui(4))

    def test_con_ts_y_presion_es_fallo_del_medio_sin_lanzar_nada(self):
        a1 = mock.Mock()
        a1.comprobar.side_effect = RuntimeError("el A1 no sabe")
        with mock.patch.dict(sys.modules, {"comprobar_en_a1": a1}), \
                mock.patch.object(T, "presion_memoria", return_value=2), \
                mock.patch.object(T, "_correr_en") as correr:
            ok, detalle = T._puertas("abc", ["def"], ["src/lib/x.ts"], cwd="/tmp")
        self.assertFalse(ok)
        self.assertTrue(T.es_fallo_del_medio(detalle))
        correr.assert_not_called()

    def test_si_el_a1_decide_manda_el_a1(self):
        a1 = mock.Mock()
        a1.comprobar.return_value = (True, "verde en el A1", False)
        with mock.patch.dict(sys.modules, {"comprobar_en_a1": a1}), \
                mock.patch.object(T, "_correr_en") as correr:
            self.assertEqual(T._puertas("abc", ["def"], ["src/lib/x.ts"], cwd="/tmp"), (True, "verde en el A1"))
        correr.assert_not_called()


if __name__ == "__main__":
    unittest.main()
