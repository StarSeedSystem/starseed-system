#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""IND1029C: la autopublicación y la autocuración solo dirigen si tienen el arriendo.

`lider_fn` se inyecta (como en `test_lider_direccion.py`): el líder manda aquí, no la puerta real.
"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as AP  # noqa: E402
import autocuracion_mando as AC  # noqa: E402

SHA = "a" * 40
T0 = 1_800_000_000.0


def lider(soy, dueno="oracle-a1"):
    """Lo justo que devuelve `lider_direccion.soy_lider()`."""
    return {"soy": soy, "motivo": "dueño: %s" % dueno, "arriendo": {"dueno": dueno}}


class MediosFalsos(object):
    def __init__(self, pendientes=0):
        self.pendientes, self.pushes = pendientes, []

    def interruptor(self):
        return True

    def publicando_a_mano(self):
        return False

    def git(self, args, timeout=None):
        if args[0] == "rev-parse":
            return 0, SHA, ""
        if args[0] == "rev-list":
            return 0, str(self.pendientes), ""
        if args[0] == "push":
            self.pushes.append(args)
        return 0, "", ""


class Autopublicar(unittest.TestCase):
    def test_sin_arriendo_no_sube_candidato_ni_publica_y_dice_quien_dirige(self):
        m = MediosFalsos(pendientes=3)
        e = AP.pasada(m, {}, T0, lider_fn=lambda: lider(False))
        self.assertEqual(e["fase"], "esperando")
        self.assertIn("espera: dirige oracle-a1", e["detalle"])
        self.assertEqual(m.pushes, [])

    def test_con_arriendo_sigue_su_pasada_normal(self):
        m = MediosFalsos(pendientes=0)
        e = AP.pasada(m, {}, T0, lider_fn=lambda: lider(True, "mac-1"))
        self.assertEqual(e["fase"], "al-dia")
        self.assertEqual(m.pushes, [])


class Autocuracion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="lider-servicios-")
        self._estado = AC.ESTADO
        AC.ESTADO = os.path.join(self.tmp, "autocuracion.json")
        self.a1, self.reinicios = [], []

    def tearDown(self):
        AC.ESTADO = self._estado

    def revisar(self, soy, sondas=(True,)):
        it = iter(sondas)
        return AC.revisar(
            ahora=100_000, sondear_fn=lambda: next(it),
            reiniciar_fn=lambda: self.reinicios.append(1),
            limpiar_fn=lambda ids: {"ok": True, "limpiados": []},
            libre_fn=lambda: 20.0, avisar_fn=lambda _t: None, dormir=lambda _s: None,
            asignar_fn=lambda: ({"puede": False}, lambda: []),
            buscar_fn=lambda: {}, traer_fn=lambda: True,
            curar_fn=lambda _e, _a, _f: "",
            servicios_fn=lambda: {"estado": "ok", "detalle": ""},
            medidores_fn=lambda _a: [], reparar_fn=lambda _f: None,
            explabs_fn=lambda: None, relevo_fn=lambda: {},
            a1_fn=lambda: self.a1.append(1),
            lider_fn=lambda: lider(soy))

    def test_sin_arriendo_no_reinicia_el_a1_ni_lo_limpia(self):
        e = self.revisar(soy=False)
        self.assertEqual(self.a1, [])
        self.assertTrue(any("espera: dirige oracle-a1" in h for h in e["hechos"]))

    def test_con_arriendo_si_cura_el_a1(self):
        self.revisar(soy=True, sondas=(True,))
        self.assertEqual(self.a1, [1])

    def test_sin_arriendo_lo_suyo_se_sigue_curando_en_local(self):
        e = self.revisar(soy=False, sondas=(False, False, False))
        self.assertEqual(self.reinicios, [1])
        self.assertTrue(any("Genesis reiniciado" in h for h in e["hechos"]))


if __name__ == "__main__":
    unittest.main()
