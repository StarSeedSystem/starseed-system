# -*- coding: utf-8 -*-
"""RST06c: la reapertura de una tarea propia no se pierde al fundir progreso.

La objeción de RST06-d2b repite dos veces «no tocó NINGUNO de sus archivos» y dos
veces «otra ola ya la cerró → no la repito». El rechazo MECÁNICO no cierra la
tarea; un cierre real (commit, decisión de la dirección) sí, y el disco manda
para las tareas que este orquestador NO está escribiendo.
"""
import importlib.util
import json
import os
import sys
import tempfile
import time
import unittest

RUTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "starseed-enjambre.py")
ESPEC = importlib.util.spec_from_file_location("enjambre_rst06", RUTA)
assert ESPEC is not None and ESPEC.loader is not None
enjambre = importlib.util.module_from_spec(ESPEC)
sys.modules["enjambre_rst06"] = enjambre
ESPEC.loader.exec_module(enjambre)

TID = "RST06-d2b"
NOTA = ("revisor: rechazo mecánico de las puertas (no tocó NINGUNO de sus 1 "
        "archivo(s)): se reescribe como tarea:alcance")
REABIERTA = "reabierta por el director: " + NOTA
CIERRE = "otra ola ya la cerró (rechazada según progreso.json) → no la repito"
INSTANTES = ("2026-11-21 08:10:01", "2026-11-21 08:16:00")


def _t(instante):
    """Hora de la objeción, sin depender del reloj de la máquina."""
    return time.mktime(time.strptime(instante, "%Y-%m-%d %H:%M:%S"))


def _foto(instante, nota=NOTA, estado="rechazada"):
    return {TID: {"estado": estado, "nota": nota, "t": _t(instante)}}


class ReaperturaMecanicaNoSePisa(unittest.TestCase):
    """El disco no revive un rechazo mecánico de una tarea que estoy reabriendo."""

    def test_rechazada_en_disco_no_pisa_pendiente_reabierta_de_la_misma_tanda(self):
        memoria = {TID: {"estado": "pendiente", "nota": REABIERTA}}
        disco = _foto(INSTANTES[0])
        fundido = enjambre.fusionar_progreso(memoria, disco, {TID})
        self.assertEqual(fundido[TID], memoria[TID])

    def test_rechazada_en_disco_si_gana_si_no_es_propia(self):
        memoria = {TID: {"estado": "pendiente", "nota": REABIERTA}}
        disco = _foto(INSTANTES[0])
        fundido = enjambre.fusionar_progreso(memoria, disco, set())
        self.assertEqual(fundido[TID], disco[TID])

    def test_rechazo_por_decision_no_se_confunde_con_reapertura(self):
        memoria = {TID: {"estado": "pendiente", "nota": REABIERTA}}
        disco = _foto(INSTANTES[0], nota="Maggasukha decidió descartar: fuera de alcance")
        fundido = enjambre.fusionar_progreso(memoria, disco, {TID})
        self.assertEqual(fundido[TID], disco[TID])

    def test_cierre_real_sigue_ganando(self):
        for estado in ("commit", "bloqueante", "sustituida"):
            with self.subTest(estado=estado):
                memoria = {TID: {"estado": "pendiente", "nota": REABIERTA}}
                disco = _foto(INSTANTES[0], nota="", estado=estado)
                fundido = enjambre.fusionar_progreso(memoria, disco, {TID})
                self.assertEqual(fundido[TID], disco[TID])


class ObjecionRST06(unittest.TestCase):
    """Los cuatro eventos del canal, con sus dos horas y las dos reaperturas."""

    def test_ambas_reaperturas_sobreviven_al_guardado(self):
        for instante in INSTANTES:
            with self.subTest(instante=instante):
                memoria = {TID: {"estado": "pendiente", "nota": REABIERTA, "t": _t(instante)}}
                disco = _foto(instante, nota=NOTA + " | " + CIERRE)
                fundido = enjambre.fusionar_progreso(memoria, disco, {TID})
                self.assertEqual(fundido[TID]["estado"], "pendiente")
                self.assertEqual(fundido[TID]["nota"], REABIERTA)

    def test_otra_ola_no_aparta_las_reaperturas_de_la_tanda(self):
        from unittest import mock

        with tempfile.TemporaryDirectory() as temporal:
            ruta = os.path.join(temporal, "progreso.json")
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump({TID: {"estado": "rechazada", "nota": NOTA + " | " + CIERRE}}, f)
            with mock.patch.dict(enjambre._CERRADAS_DISCO, {"t": 0.0, "ids": frozenset()}):
                cerradas = enjambre.cerradas_en_disco(cada_s=0, ruta=ruta)
        self.assertNotIn(TID, cerradas)


if __name__ == "__main__":
    unittest.main()
