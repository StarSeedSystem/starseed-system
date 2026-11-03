# -*- coding: utf-8 -*-
"""Ola 1103 · I: lo que la nube ya devolvió no sigue «en vuelo»."""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import repartir_nube as RN  # noqa: E402


def test_lo_devuelto_sale_del_vuelo():
    ahora = datetime.datetime(2026, 11, 2, 21, 0).timestamp()
    colas = [("cola-nube-20261102-2030.json", ["A", "B", "C", "D"])]
    assert RN.en_vuelo(colas, ahora) == {"A", "B", "C", "D"}
    prog = {"A": {"estado": "pendiente", "nota": "devuelta de la nube: su run terminó"},
            "B": {"estado": "commit"}, "C": {"estado": "reasignada", "nota": "nube"}, "D": {"estado": "pendiente"}}
    assert RN.en_vuelo(colas, ahora, progreso=prog) == {"C", "D"}
    assert RN.ya_volvio({"nota": "traída de la nube (nube/x)"}) and not RN.ya_volvio(None)
