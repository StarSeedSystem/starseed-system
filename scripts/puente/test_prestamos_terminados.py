#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Préstamos de MetaGenesis: UN PRÉSTAMO TERMINA CUANDO TERMINA SU COLA (CAP1020A).

Medido el 2026-10-20 (13:30, hora de la Mac): el A1 terminó su cola `cola-mg-oracle-1020-1223`
a las 19:24 UTC (55 min, 2 entregas) y se quedó parado, mientras 10 de las 25 tareas listas
seguían «prestadas» a él durante 6 h: ni la Mac, ni la nube, ni el propio A1 podían cogerlas.

Aquí: la regla pura (un préstamo termina con su cola, con su `fin` o con la gracia), el nodo que
marca `fin` en el préstamo cuando el A1 dice que terminó su cola, y que ese `fin` sobrevive al
podar la memoria. Sin red y sin disco real: solo memoria en dictionaries y un archivo temporal.
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import nodo_metagenesis as N  # noqa: E402
import repartir_nube as R  # noqa: E402

T0 = 1_792_600_000.0  # 2026-10-20 ~13:33 UTC
GRACIA = R.GRACIA_PRESTAMO_S
COLA = "cola-mg-oracle-1020-1223"


def prestamo(ids=("T1", "T2"), cola=COLA, ts=T0, **mas):
    return dict({"ids": list(ids), "destino": "oracle-a1-bbbbbb", "cola": cola, "ts": ts}, **mas)


def estado_del_a1(cola=None, fin=None):
    """El estado que deja `oracle_nodo.estado()`: «nodo» → «colas» → «ultima»."""
    ultima = {"cola": cola, "fin": fin, "rc": "0", "entregas": ["x"]} if cola else None
    return {"nodo": {"colas": {"procesadas": 2, "ultima": ultima}}}


class TestReglaPura(unittest.TestCase):
    """La regla del reparto a la nube: un préstamo vivo hasta que su cola termina."""

    def test_nombre_cola_normaliza(self):
        self.assertEqual(R.nombre_cola("cola-mg-oracle-1020-1223.json"), COLA)
        self.assertEqual(R.nombre_cola("/var/lib/starseed/nodo/colas/cola-mg-oracle-1020-1223.json"), COLA)
        self.assertEqual(R.nombre_cola(COLA), COLA)
        self.assertEqual(R.nombre_cola(None), "")

    def test_prestamo_vigente_mientras_su_cola_no_termino(self):
        p = prestamo()
        self.assertTrue(R.prestamo_vigente(p, T0 + 60, GRACIA))
        self.assertTrue(R.prestamo_vigente(p, T0 + 60, GRACIA, colas_terminadas=["otra-cola"]))

    def test_prestamo_vigente_muere_con_la_cola_terminada(self):
        p = prestamo()
        self.assertFalse(R.prestamo_vigente(p, T0 + 60, GRACIA, colas_terminadas=[COLA]))
        self.assertFalse(R.prestamo_vigente(p, T0 + 60, GRACIA, colas_terminadas=[COLA + ".json"]))

    def test_prestamo_vigente_muere_con_fin(self):
        p = prestamo(fin=T0 + 60)
        self.assertFalse(R.prestamo_vigente(p, T0 + 60, GRACIA))

    def test_prestamo_vigente_muere_con_la_gracia(self):
        viejo = prestamo(ts=T0 - GRACIA - 1)
        self.assertFalse(R.prestamo_vigente(viejo, T0, GRACIA))

    def test_prestadas_vigentes_libera_los_ids_terminados(self):
        memoria = {"prestamos": [prestamo(ids=["T1"]), prestamo(ids=["T2"], cola="cola-mg-otro-1020-1300")]}
        vivas = R.prestadas_vigentes(memoria, T0 + 60, GRACIA)
        self.assertEqual(vivas, {"T1", "T2"})
        tras_fin = R.prestadas_vigentes(memoria, T0 + 60, GRACIA, colas_terminadas=[COLA])
        self.assertEqual(tras_fin, {"T2"})


class TestNodo(unittest.TestCase):
    """El nodo de MetaGenesis: marca `fin` en el préstamo cuya cola el A1 ya terminó."""

    def _nodo(self, prestamos):
        nodo = N.Nodo.__new__(N.Nodo)
        nodo.modo = "real"
        nodo.mem = {"prestamos": prestamos}
        nodo._asignaciones = []
        nodo._medida_salud = {}
        return nodo

    def test_cola_terminada_pura(self):
        self.assertEqual(N.cola_terminada(estado_del_a1(COLA + ".json", T0 + 600)),
                         (COLA + ".json", T0 + 600))
        self.assertIsNone(N.cola_terminada({"nodo": {"colas": {"procesadas": 1}}}))
        self.assertIsNone(N.cola_terminada({}))

    def test_nodo_marca_fin_cuando_el_a1_termino_su_cola(self):
        prestamos = [prestamo(ids=["T1"])]
        nodo = self._nodo(prestamos)
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "oracle.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(estado_del_a1(COLA + ".json", T0 + 600), f)
            with mock.patch.object(N, "ESTADO_ORACLE", ruta):
                marcadas = nodo._cerrar_prestamos_terminados(T0 + 900)
        self.assertEqual(marcadas, [COLA])
        self.assertEqual(prestamos[0]["fin"], T0 + 600)
        self.assertNotIn("T1", nodo._prestadas(T0 + 900))

    def test_nodo_no_marca_fin_si_la_cola_sigue_viva(self):
        prestamos = [prestamo(ids=["T1"])]
        nodo = self._nodo(prestamos)
        with tempfile.TemporaryDirectory() as tmp:
            ruta = os.path.join(tmp, "oracle.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(estado_del_a1("cola-mg-otro-1020-1300.json", T0 + 600), f)
            with mock.patch.object(N, "ESTADO_ORACLE", ruta):
                marcadas = nodo._cerrar_prestamos_terminados(T0 + 900)
        self.assertEqual(marcadas, [])
        self.assertNotIn("fin", prestamos[0])
        self.assertIn("T1", nodo._prestadas(T0 + 900))

    def test_fin_sobrevive_al_podar(self):
        prestamos = [prestamo(ids=["T%d" % i], ts=T0 - 100 + i) for i in range(25)]
        prestamos[-1]["fin"] = T0 + 600
        podados = N.podar_prestamos(prestamos, T0, gracia_s=GRACIA)
        self.assertEqual(len(podados), 20)
        self.assertEqual(podados[0]["ids"], ["T5"])
        self.assertEqual(podados[-1]["fin"], T0 + 600)

    def test_ids_terminados_vuelven_al_reparto(self):
        prestamos = [prestamo(ids=["T1"], fin=T0 + 600), prestamo(ids=["T2"], cola="cola-mg-x-1")]
        vivas = R.prestadas_vigentes({"prestamos": prestamos}, T0 + 900, GRACIA)
        self.assertEqual(vivas, {"T2"})
