# -*- coding: utf-8 -*-
"""CAP1025E (2026-10-25): el préstamo al A1 llega con los trabajadores que el A1 dice que lleva.

Medido el 25-10: el A1 corre su enjambre con 3 trabajadores (`STARSEED_A1_TRABAJADORES=3` en
starseed-medio.service), pero cada préstamo de MetaGenesis le llegaba con `--workers 2` y 4 tareas: 67 min
por cola, el último agente solo y un agente menos del que tiene."""
import os
import sys
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis_logica as L  # noqa: E402


def a1(trabajadores=None, fase="guardian"):
    s = {"repo": True, "orquestador": True, "orquestadores": [], "a1": {"fase": fase, "cola": "",
                                                                        "orquestador_vivo": False}}
    if trabajadores is not None:
        s["a1"]["trabajadores"] = trabajadores
    return {"modo": "real", "secreto": True, "salud": s}


class TrabajadoresDelPrestamo(unittest.TestCase):
    def test_lo_que_publica_el_medio(self):
        self.assertEqual(L.trabajadores_prestamo(a1(3)), 3)
        self.assertIsNone(L.trabajadores_prestamo(a1()))
        for malo in (0, 5, True, "3", None):
            self.assertIsNone(L.trabajadores_prestamo(a1(malo)))
        self.assertIsNone(L.trabajadores_prestamo({}))

    def test_dos_rondas_de_tareas(self):
        self.assertEqual([L.tope_prestamo(x) for x in (None, 1, 2, 3, 4)], [4, 4, 4, 6, 8])

    def test_el_plan_presta_seis_con_tres_trabajadores(self):
        plan = L.planificar_resultados("mac", {"trabajo": {"listas": 300}}, {"a1": a1(3)}, "mac", 1e9)
        (rep,) = [a for a in plan if a["accion"] == "repartir"]
        self.assertEqual(rep["args"], {"destino": "a1", "tope": 6, "trabajadores": 3})
        self.assertIsNone(L.args_validos("repartir", rep["args"]))

    def test_sin_dato_como_siempre(self):
        plan = L.planificar_resultados("mac", {"trabajo": {"listas": 300}}, {"a1": a1()}, "mac", 1e9)
        (rep,) = [a for a in plan if a["accion"] == "repartir"]
        self.assertEqual(rep["args"], {"destino": "a1", "tope": L.REPARTO_TOPE})


class LanzarConSusTrabajadores(unittest.TestCase):
    def test_la_cola_prestada_lleva_los_trabajadores_del_medio(self):
        import nodo_metagenesis as N

        nodo = N.Nodo.__new__(N.Nodo)
        nodo.modo, nodo.mem = "seco", {}
        vistos = []
        with mock.patch.object(N.Nodo, "_repartir", lambda self, a, informe, t: vistos.append(a), create=True):
            N.Nodo._prestar(nodo, [{"id": "X1", "titulo": "x", "prompt": "p"}], "oracle-a1-cd000b", "m", {}, 1e9,
                            trabajadores=3)
            N.Nodo._prestar(nodo, [{"id": "X2", "titulo": "x", "prompt": "p"}], "oracle-a1-cd000b", "m", {}, 1e9)
        self.assertEqual([a["args"]["trabajadores"] for a in vistos], [3, 2])

    def test_el_a1_publica_sus_trabajadores(self):
        import json
        import tempfile

        import nodo_metagenesis_medio as M

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"fase": "guardian", "orquestador": {"vivo": False, "cola": None, "trabajadores": 3}}, f)
        real = M.leer_json
        try:
            with mock.patch.object(M, "leer_json", lambda ruta, defecto=None: real(f.name, defecto)):
                self.assertEqual(M.estado_a1()["trabajadores"], 3)
        finally:
            os.unlink(f.name)


if __name__ == "__main__":
    unittest.main()
