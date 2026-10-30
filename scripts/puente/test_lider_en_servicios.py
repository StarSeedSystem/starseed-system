# -*- coding: utf-8 -*-
"""Pruebas del líder en los servicios de dirección (IND1029C): sin arriendo, la autopublicación
espera y la autocuración solo cuida su propia máquina. El líder se inyecta; sin red ni disco real."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import autopublicar as A  # noqa: E402
import autocuracion_mando as C  # noqa: E402
import test_autopublicar as TA  # noqa: E402

T0 = 1_800_000_000.0


def sin_lider(quien="oracle-a1-9"):
    return lambda: {"soy": False, "motivo": "dueño: %s" % quien, "arriendo": {"dueno": quien}}


def con_lider():
    return lambda: {"soy": True, "motivo": "líder vigente", "arriendo": {"dueno": "mac-1"}}


class Autopublicacion(unittest.TestCase):
    def test_sin_lider_no_publica_ni_sube_candidatos(self):
        m = TA.Falso()
        setattr(m, "soy_lider", sin_lider())
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "esperando")
        self.assertIn("espera: dirige oracle-a1-9", e["detalle"])
        self.assertEqual(m.pushes, [])

    def test_con_lider_publica_como_siempre(self):
        m = TA.Falso()
        setattr(m, "soy_lider", con_lider())
        e = A.pasada(m, {}, T0)
        self.assertEqual(e["fase"], "ci")
        self.assertEqual(len(m.pushes), 1)

    def test_sin_puerta_sigue_lider_en_local(self):
        self.assertEqual(A.pasada(TA.Falso(), {}, T0)["fase"], "ci")

    def test_quien_dirige_sin_arriendo(self):
        self.assertEqual(A.quien_dirige({}), "otra neurona")
        self.assertEqual(A.quien_dirige({"arriendo": {"dueno": "a1"}}), "a1")


class Autocuracion(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self._estado, self._pub = C.ESTADO, C.PUBLICACION
        C.ESTADO = os.path.join(self.tmp, "estado.json")
        C.PUBLICACION = os.path.join(self.tmp, "publicacion.json")
        self.hecho = {"reinicios": [], "limpiezas": [], "curar": [], "buscar": [], "traer": [],
                      "a1": [], "reparar": [], "relevo": []}

    def tearDown(self):
        C.ESTADO, C.PUBLICACION = self._estado, self._pub

    def _revisar(self, lider, sondas, libre=20.0):
        it = iter(sondas)
        h = self.hecho
        return C.revisar(
            ahora=100_000, sondear_fn=lambda: next(it), reiniciar_fn=lambda: h["reinicios"].append(1),
            limpiar_fn=lambda ids: (h["limpiezas"].append(ids) or {"limpiados": list(ids)}),
            libre_fn=lambda: libre, avisar_fn=lambda _t: None, dormir=lambda _s: None,
            asignar_fn=lambda: ({"puede": False}, lambda: []),
            buscar_fn=lambda: h["buscar"].append(1) or {},
            traer_fn=lambda: h["traer"].append(1) or True,
            curar_fn=lambda e, a, f: h["curar"].append(1) or "",
            servicios_fn=lambda: {"estado": "ok", "detalle": ""},
            medidores_fn=lambda a: [], worktrees_fn=lambda: {},
            reparar_fn=lambda f: h["reparar"].append(1), explabs_fn=lambda: None,
            relevo_fn=lambda: h["relevo"].append(1) or {}, a1_fn=lambda: h["a1"].append(1),
            lider_fn=lider)

    def test_sin_lider_no_toca_nube_enjambre_ni_a1(self):
        self._revisar(sin_lider(), [True])
        for clave in ("curar", "buscar", "traer", "a1", "reparar", "relevo"):
            self.assertEqual(self.hecho[clave], [], clave)

    def test_sin_lider_solo_cuida_su_propia_maquina(self):
        self._revisar(sin_lider(), [False, False, False], libre=4.0)
        self.assertEqual(self.hecho["reinicios"], [1])   # su Genesis, su máquina
        self.assertTrue(self.hecho["limpiezas"])         # su disco, su máquina

    def test_con_lider_hace_lo_de_siempre(self):
        self._revisar(con_lider(), [True])
        for clave in ("curar", "buscar", "traer", "a1", "reparar", "relevo"):
            self.assertEqual(self.hecho[clave], [1], clave)

    def test_quien_dirige_sin_arriendo(self):
        self.assertEqual(C._quien_dirige(None), "otra neurona")


if __name__ == "__main__":
    unittest.main()
